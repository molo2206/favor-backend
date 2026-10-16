// notifications.controller.ts
import {
  Controller,
  Get,
  Patch,
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
   * Récupérer les notifications de l'utilisateur courant
   * GET /notifications?page=1&limit=10
   */
  @Get()
  async getMyNotifications(
    @CurrentUser() user: UserEntity,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const result = await this.notificationsService.getUserNotifications(
      user.id,
      pageNum,
      limitNum,
      // Note: la méthode getUserNotifications n'accepte pas encore lang,
      // mais si besoin, ajoutez le paramètre. Pour l'instant, on laisse.
    );
    return { data: result };
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
   * Marquer toutes les notifications comme lues
   * PATCH /notifications/read-all
   */
  @Patch('read-all')
  async markAllAsRead(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    return this.notificationsService.markAllAsRead(user.id, lang);
  }

  /**
   * Compter les notifications non lues
   * GET /notifications/unread-count
   */
  @Get('unread-count')
  async getUnreadCount(
    @CurrentUser() user: UserEntity,
  ) {
    return this.notificationsService.getUnreadCount(user.id);
  }
}