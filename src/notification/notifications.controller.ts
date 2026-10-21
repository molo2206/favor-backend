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
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { Request } from 'express';
import { NOTIFICATION_CATEGORIES } from './type/notification.type';

@Controller('notifications')
@UseGuards(AuthentificationGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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
   */
  @Get()
  async getMyNotifications(
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
    @CurrentUser() user: UserEntity,
    @Query('category') category?: string,
    @Query('type') type?: string,
  ) {
    return this.notificationsService.getUnreadCount(
      user.id,
      this.resolveTypes(category, type),
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
