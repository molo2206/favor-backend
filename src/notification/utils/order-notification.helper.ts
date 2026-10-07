// src/order/order-notification.helper.ts
import { Injectable } from '@nestjs/common';
import { NotificationsService } from 'src/notification/notifications.service';
import { OrderEntity } from 'src/order/entities/order.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class OrderNotificationHelper {
  constructor(private readonly notificationsService: NotificationsService) { }

  private getOrderNotificationTexts(type: string, data: any, lang: string): { title: string; message: string } {
    const translations: Record<string, Record<string, { title: string; message: string }>> = {
      order_created: {
        fr: { title: 'Nouvelle commande', message: `Une nouvelle commande (${data.invoiceNumber}) a été créée pour un montant de ${data.totalAmount} ${data.currency}.` },
        en: { title: 'New order', message: `A new order (${data.invoiceNumber}) has been created for ${data.totalAmount} ${data.currency}.` },
        sw: { title: 'Agizo jipya', message: `Agizo jipya (${data.invoiceNumber}) limeundwa kwa kiasi cha ${data.totalAmount} ${data.currency}.` },
        es: { title: 'Nuevo pedido', message: `Se ha creado un nuevo pedido (${data.invoiceNumber}) por ${data.totalAmount} ${data.currency}.` },
      },
      order_updated: {
        fr: { title: 'Mise à jour commande', message: `Le statut de votre commande ${data.invoiceNumber} est passé à ${data.status}.` },
        en: { title: 'Order update', message: `The status of your order ${data.invoiceNumber} has changed to ${data.status}.` },
        sw: { title: 'Sasisho la agizo', message: `Hali ya agizo lako ${data.invoiceNumber} imebadilika kuwa ${data.status}.` },
        es: { title: 'Actualización de pedido', message: `El estado de tu pedido ${data.invoiceNumber} ha cambiado a ${data.status}.` },
      },
    };
    const defaultTexts = {
      fr: { title: 'Notification', message: data.message || 'Vous avez reçu une notification.' },
      en: { title: 'Notification', message: data.message || 'You have received a notification.' },
      sw: { title: 'Arifa', message: data.message || 'Umepokea arifa.' },
      es: { title: 'Notificación', message: data.message || 'Has recibido una notificación.' },
    };
    return translations[type]?.[lang] || defaultTexts[lang];
  }

  /**
   * Méthode générique pour envoyer une notification
   */
  async notify(
    userId: string,
    type: string,
    lang: string,
    data: any = {},
    entity?: string,
    entityId?: string,
  ): Promise<void> {
    const { title, message } = this.getOrderNotificationTexts(type, data, lang);
    await this.notificationsService.sendNotificationToUser(
      userId,
      title,
      message,
      type as any,
      { ...data, entity, entityId },
    );
  }

  /**
   * Notifie tous les destinataires concernés par une nouvelle commande
   */
  async notifyOrderCreated(
    order: OrderEntity,
    companyIds: string[],
    owners: UserEntity[],
    platformUsers: UserEntity[],
    superAdmins: UserEntity[],
    lang: string,
  ): Promise<void> {
    const allRecipients = [...platformUsers, ...superAdmins, ...owners].filter(
      (user, index, self) => user && user.id && index === self.findIndex((u) => u.id === user.id),
    );
    for (const recipient of allRecipients) {
      await this.notify(
        recipient.id,
        'order_created',
        lang,
        {
          invoiceNumber: order.invoiceNumber,
          totalAmount: order.totalAmount,
          currency: order.currency,
        },
        'Order',
        order.id,
      );
    }
  }

  /**
   * Notifie l'acheteur du changement de statut de sa commande
   */
  async notifyOrderStatusChanged(
    order: OrderEntity,
    newStatus: string,
    lang: string,
  ): Promise<void> {
    await this.notify(
      order.userId,
      'order_updated',
      lang,
      {
        invoiceNumber: order.invoiceNumber,
        status: newStatus,
      },
      'Order',
      order.id,
    );
  }
}