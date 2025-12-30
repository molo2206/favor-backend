import { Injectable } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationType } from './type/notification.type';

@Injectable()
export class NotificationsService {
  constructor(private readonly gateway: NotificationsGateway) {}

  /** Notification à un utilisateur spécifique */
  async sendNotificationToUser(
    userId: string,
    title: string,
    message: string,
    type: NotificationType,
    data?: any,
  ) {
    const notification = { title, message, type, data };
    this.gateway.sendNotificationToUser(userId, notification);
  }

  /** Notification à une room (channel) */
  sendNotificationToRoom(
    roomId: string,
    event: string,
    type: NotificationType,
    payload: any,
  ) {
    const notification = { ...payload, type };
    this.gateway.sendNotificationToRoom(roomId, event, notification);
  }
}