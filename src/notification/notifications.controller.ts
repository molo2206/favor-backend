// notifications.controller.ts
import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
  Post,
  Body,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FcmService } from './fcm.service';
import { ApnsVoipClient } from './apns-voip.client';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';
import { NotificationsService } from './notifications.service';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { Request } from 'express';
import { NOTIFICATION_CATEGORIES } from './type/notification.type';
import { channelFromHeaders } from './utils/platform-channel';

@Controller('notifications')
@UseGuards(AuthentificationGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    // ✅ Test des notifications « appel » (Android / iPhone / web)
    private readonly fcmService: FcmService,
    private readonly config: ConfigService,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,
  ) {}

  // ============================================================
  // ✅ TEST DES APPELS — chaque utilisateur vérifie son propre téléphone
  // ============================================================

  /** Mes appareils enregistrés : plateforme, jeton Firebase, jeton VoIP (iPhone) */
  @Get('call-test/devices')
  async myCallDevices(@CurrentUser() user: UserEntity) {
    const devices = await this.deviceTokenRepo.find({ where: { userId: user.id }, order: { updatedAt: 'DESC' } });
    const voip = ApnsVoipClient.shared(this.config);
    return {
      message: 'Appareils enregistrés',
      data: {
        voipServerEnabled: voip.enabled,
        devices: devices.map((d) => ({
          id: d.id,
          platform: d.platform ?? null,
          fcmToken: d.token ? `${d.token.slice(0, 12)}…${d.token.slice(-6)}` : null,
          hasVoipToken: !!d.voipToken,
          // Mode d'envoi qu'utilisera le serveur pour un appel
          callVia: d.voipToken && voip.enabled ? 'APPLE_VOIP' : String(d.platform || '').match(/^(web|admin|group)$/) ? 'WEB_PUSH' : 'FIREBASE_DATA',
          updatedAt: d.updatedAt,
        })),
      },
    };
  }

  /**
   * Envoie un appel de test à MES appareils (sonne comme une offre de course) :
   * { "seconds": 20, "channel": "ride_calls" | "order_calls" }
   */
  @Post('call-test')
  async sendTestCall(@CurrentUser() user: UserEntity, @Body() body: { seconds?: number; channel?: string }) {
    const seconds = Math.min(60, Math.max(10, Number(body?.seconds) || 20));
    const channel = body?.channel === 'order_calls' ? 'order_calls' : 'ride_calls';
    const callId = `test-${Date.now()}`;
    const reached = await this.fcmService.sendCallToUsers(
      [user.id],
      'Appel de test Favor',
      'Si votre téléphone sonne, les appels fonctionnent ✅',
      { category: channel === 'order_calls' ? 'order' : 'ride', type: 'test_call', screen: 'ride_incoming', test: 'true' },
      {
        callId,
        ttlSeconds: seconds,
        androidChannelId: channel,
        androidSound: channel === 'order_calls' ? 'order_ringtone' : 'ride_ringtone',
        iosSound: channel === 'order_calls' ? 'order_ringtone.caf' : 'ride_ringtone.caf',
        iosCategory: 'RIDE_CALL',
      },
    );
    return {
      message: reached.length ? 'Appel de test envoyé à vos appareils' : 'Aucun appareil joignable : enregistrez d\'abord le jeton (POST /users/device-token)',
      data: { callId, seconds, reached: reached.length > 0 },
    };
  }

  /** Arrête la sonnerie de test : { "callId": "test-…" } */
  @Post('call-test/cancel')
  async cancelTestCall(@CurrentUser() user: UserEntity, @Body() body: { callId?: string }) {
    const callId = String(body?.callId || '');
    if (!callId.startsWith('test-')) return { message: 'callId de test invalide', data: null };
    await this.fcmService.cancelCallForUsers([user.id], callId, 'TEST', { category: 'ride', type: 'test_call_cancel' });
    return { message: 'Sonnerie arrêtée', data: { callId } };
  }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es'];
    return supported.includes(primary) ? primary : 'fr';
  }

  /**
   * Filtre optionnel :
   *   ?category=chat            → toutes les notifications du chat back-office
   *   ?type=chat_message,order_created → types précis (séparés par des virgules)
   */
  private resolveTypes(category?: string, type?: string): string[] | undefined {
    const types = new Set<string>();
    if (category && NOTIFICATION_CATEGORIES[category]) {
      NOTIFICATION_CATEGORIES[category].forEach((t) => types.add(t));
    }
    (type ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((t) => types.add(t));
    return types.size ? [...types] : undefined;
  }

  /**
   * Récupérer les notifications de l'utilisateur courant
   * GET /notifications?page=1&limit=10&category=chat&unreadOnly=true
   * ✅ En-tête x-platform (ios, android, web, admin, group) : seulement les notifications de cette application
   */
  @Get()
  async getMyNotifications(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const result = await this.notificationsService.getUserNotifications(
      user.id,
      pageNum,
      limitNum,
      {
        types: this.resolveTypes(category, type),
        unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
        channel: channelFromHeaders(req.headers),
      },
    );
    return { data: result };
  }

  /**
   * Compter les notifications non lues
   * GET /notifications/unread-count?category=chat
   */
  @Get('unread-count')
  async getUnreadCount(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('category') category?: string,
    @Query('type') type?: string,
  ) {
    return this.notificationsService.getUnreadCount(
      user.id,
      this.resolveTypes(category, type),
      channelFromHeaders(req.headers),
    );
  }

  /**
   * Marquer toutes les notifications comme lues
   * PATCH /notifications/read-all?category=chat
   */
  @Patch('read-all')
  async markAllAsRead(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('category') category?: string,
    @Query('type') type?: string,
  ) {
    const lang = this.extractLanguage(req);
    return this.notificationsService.markAllAsRead(
      user.id,
      lang,
      this.resolveTypes(category, type),
      channelFromHeaders(req.headers),
    );
  }

  @Patch(':id/read')
  async markAsRead(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    return this.notificationsService.markAsRead(id, user.id, lang);
  }

  /**
   * Supprimer toutes les notifications (ou une catégorie)
   * DELETE /notifications?category=chat
   */
  @Delete()
  async deleteAll(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('category') category?: string,
    @Query('type') type?: string,
  ) {
    const lang = this.extractLanguage(req);
    return this.notificationsService.deleteAllNotifications(
      user.id,
      this.resolveTypes(category, type),
      lang,
      channelFromHeaders(req.headers),
    );
  }

  /**
   * Supprimer une notification
   * DELETE /notifications/:id
   */
  @Delete(':id')
  async deleteOne(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    return this.notificationsService.deleteNotification(id, user.id, lang);
  }
}
