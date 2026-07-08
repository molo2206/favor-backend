/* eslint-disable no-case-declarations */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationType } from './type/notification.type';
import { UserNotification } from 'src/firebase/entities/user-notification.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { OrderEntity } from 'src/order/entities/order.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';

// Dictionnaire interne des traductions
const translations: Record<string, Record<string, string | ((params: any) => string)>> = {
  'notification.title.SHOP': { fr: 'Nouvelle alerte boutique', en: 'New shop alert', sw: 'Arifa mpya ya duka', es: 'Nueva alerta de tienda' },
  'notification.title.DEALER': { fr: 'Nouvelle alerte concessionnaire', en: 'New dealer alert', sw: 'Arifa mpya ya muuzaji', es: 'Nueva alerta de concesionario' },
  'notification.title.FOOD': { fr: 'Nouvelle alerte alimentaire', en: 'New food alert', sw: 'Arifa mpya ya chakula', es: 'Nueva alerta de comida' },
  'notification.title.SERVICE': { fr: 'Nouvelle alerte service', en: 'New service alert', sw: 'Arifa mpya ya huduma', es: 'Nueva alerta de servicio' },
  'notification.title.GROCERY': { fr: 'Nouvelle alerte épicerie', en: 'New grocery alert', sw: 'Arifa mpya ya mboga', es: 'Nueva alerta de comestibles' },
  'notification.title.ECOMMERCE': { fr: 'Nouvelle alerte e-commerce', en: 'New e-commerce alert', sw: 'Arifa mpya ya e-commerce', es: 'Nueva alerta de e-commerce' },
  'notification.title.PRODUCT': { fr: 'Nouveau produit', en: 'New product', sw: 'Bidhaa mpya', es: 'Nuevo producto' },
  'notification.title.COMPANY': { fr: 'Nouvelle alerte entreprise', en: 'New company alert', sw: 'Arifa mpya ya kampuni', es: 'Nueva alerta de empresa' },
  'notification.title.NEW_RIDE': { fr: 'Nouvelle course disponible', en: 'New ride available', sw: 'Safari mpya inapatikana', es: 'Nuevo viaje disponible' },
  'notification.title.RIDE_ACCEPTED': { fr: 'Course acceptée', en: 'Ride accepted', sw: 'Safari imekubaliwa', es: 'Viaje aceptado' },
  'notification.title.RIDE_CANCELLED': { fr: 'Course annulée', en: 'Ride cancelled', sw: 'Safari imefutwa', es: 'Viaje cancelado' },
  'notification.title.LOGISTIC': { fr: 'Notification logistique', en: 'Logistics notification', sw: 'Arifa ya vifaa', es: 'Notificación logística' },
  'notification.title.ORDER_CREATED': { fr: 'Nouvelle commande', en: 'New order', sw: 'Agizo jipya', es: 'Nuevo pedido' },
  'notification.title.ORDER_UPDATED': { fr: 'Mise à jour commande', en: 'Order update', sw: 'Sasisho la agizo', es: 'Actualización de pedido' },
  'notification.title.SHIPMENT_CREATED': { fr: 'Nouveau colis', en: 'New parcel', sw: 'Mfuko mpya', es: 'Nuevo paquete' },
  'notification.title.RESERVATION_CREATED': { fr: 'Nouvelle réservation', en: 'New booking', sw: 'Nafasi mpya', es: 'Nueva reserva' },
  'notification.title.WISHLIST': { fr: 'Vos favoris', en: 'Your favorites', sw: 'Vipendwa vyako', es: 'Tus favoritos' },
  'notification.title.WISHLIST_REMINDER': { fr: 'Rappel wishlist', en: 'Wishlist reminder', sw: 'Kumbusho la orodha ya matakwa', es: 'Recordatorio de lista de deseos' },
  'notification.title.PROMOTION': { fr: 'Promotion', en: 'Promotion', sw: 'Ofa', es: 'Promoción' },
  'notification.title.NEWSLETTER': { fr: 'Newsletter', en: 'Newsletter', sw: 'Jarida', es: 'Boletín' },
  'notification.title.TRIP_REMINDER': { fr: 'Rappel voyage', en: 'Trip reminder', sw: 'Kumbusho la safari', es: 'Recordatorio de viaje' },
  'notification.title.TRIP_UPDATED': { fr: 'Voyage mis à jour', en: 'Trip updated', sw: 'Safari imesasishwa', es: 'Viaje actualizado' },
  'notification.title.TRIP_CANCELLED': { fr: 'Voyage annulé', en: 'Trip cancelled', sw: 'Safari imefutwa', es: 'Viaje cancelado' },
  'notification.title.RESERVATION_UPDATED': { fr: 'Réservation mise à jour', en: 'Booking updated', sw: 'Nafasi imesasishwa', es: 'Reserva actualizada' },
  'notification.title.RESERVATION_CONFIRMED': { fr: 'Réservation confirmée', en: 'Booking confirmed', sw: 'Nafasi imethibitishwa', es: 'Reserva confirmada' },
  'notification.title.RESERVATION_CANCELLED': { fr: 'Réservation annulée', en: 'Booking cancelled', sw: 'Nafasi imefutwa', es: 'Reserva cancelada' },
  'notification.title.TICKET_SCANNED': { fr: 'Billet scanné', en: 'Ticket scanned', sw: 'Tiketi imechanjwa', es: 'Boleto escaneado' },
  'notification.title.PAYMENT_SUCCESS': { fr: 'Paiement confirmé', en: 'Payment confirmed', sw: 'Malipo yamethibitishwa', es: 'Pago confirmado' },
  'notification.title.PAYMENT_FAILED': { fr: 'Paiement échoué', en: 'Payment failed', sw: 'Malipo yameshindwa', es: 'Pago fallido' },
  'notification.title.STOCK_ALERT': { fr: 'Alerte stock', en: 'Stock alert', sw: 'Tahadhari ya hisa', es: 'Alerta de stock' },
  'notification.title.LOW_STOCK': { fr: 'Stock faible', en: 'Low stock', sw: 'Hisa ndogo', es: 'Stock bajo' },
  'notification.title.REVIEW_REQUEST': { fr: "Demande d'avis", en: 'Review request', sw: 'Ombi la maoni', es: 'Solicitud de opinión' },
  'notification.title.DELIVERY_UPDATED': { fr: 'Livraison mise à jour', en: 'Delivery updated', sw: 'Uwasilishaji umesasishwa', es: 'Entrega actualizada' },
  'notification.title.DELIVERY_DELIVERED': { fr: 'Livraison effectuée', en: 'Delivery completed', sw: 'Uwasilishaji umekamilika', es: 'Entrega completada' },
  'notification.title.PASSWORD_RESET': { fr: 'Réinitialisation mot de passe', en: 'Password reset', sw: 'Kuweka upya nywila', es: 'Restablecimiento de contraseña' },
  'notification.title.LOGIN_ALERT': { fr: 'Nouvelle connexion', en: 'New login', sw: 'Kuingia mpya', es: 'Nuevo inicio de sesión' },
  'notification.title.ACCOUNT_SUSPENDED': { fr: 'Compte suspendu', en: 'Account suspended', sw: 'Akaunti imesimamishwa', es: 'Cuenta suspendida' },
  'notification.default_title': { fr: 'Nouvelle notification', en: 'New notification', sw: 'Arifa mpya', es: 'Nueva notificación' },
  'notification.ride_default_content': { fr: 'Mise à jour de la course', en: 'Ride update', sw: 'Sasisho la safari', es: 'Actualización del viaje' },

  'notification.shipment_created_title': { fr: 'Colis créé', en: 'Parcel created', sw: 'Mfuko umeundwa', es: 'Paquete creado' },
  'notification.shipment_created_content': { fr: 'Votre colis {trackingNumber} a été créé avec succès. Vous pouvez suivre son trajet en temps réel.', en: 'Your parcel {trackingNumber} has been successfully created. You can track its journey in real time.', sw: 'Mfuko wako {trackingNumber} umeundwa kwa mafanikio. Unaweza kufuatilia safari yake kwa wakati halisi.', es: 'Su paquete {trackingNumber} ha sido creado con éxito. Puede seguir su trayecto en tiempo real.' },
  'notification.shipment_created_for_company_title': { fr: 'Nouveau colis pour la société de {companyType}', en: 'New parcel for {companyType} company', sw: 'Mfuko mpya kwa kampuni ya {companyType}', es: 'Nuevo paquete para la empresa de {companyType}' },
  'notification.shipment_created_for_company_content': { fr: 'Un nouveau colis ({trackingNumber}) a été créé pour votre société de {companyType}. Veuillez le prendre en charge.', en: 'A new parcel ({trackingNumber}) has been created for your {companyType} company. Please take care of it.', sw: 'Mfuko mpya ({trackingNumber}) umeundwa kwa kampuni yako ya {companyType}. Tafadhali uchukue.', es: 'Se ha creado un nuevo paquete ({trackingNumber}) para su empresa de {companyType}. Por favor, encárguese de él.' },
  'notification.order_created_title': { fr: '📦 Nouvelle commande', en: '📦 New order', sw: '📦 Agizo jipya', es: '📦 Nuevo pedido' },
  'notification.order_created_content': { fr: 'Une nouvelle commande ({invoiceNumber}) a été créée pour un montant de {totalAmount} {currency}.', en: 'A new order ({invoiceNumber}) has been created for {totalAmount} {currency}.', sw: 'Agizo jipya ({invoiceNumber}) limeundwa kwa kiasi cha {totalAmount} {currency}.', es: 'Se ha creado un nuevo pedido ({invoiceNumber}) por {totalAmount} {currency}.' },
  'notification.reservation_confirmed_title': { fr: 'Réservation confirmée', en: 'Booking confirmed', sw: 'Nafasi imethibitishwa', es: 'Reserva confirmada' },
  'notification.reservation_confirmed_content': { fr: 'Votre réservation de voyage {departureCity} → {arrivalCity} a été confirmée. Montant: {totalAmount} {currency}', en: 'Your trip booking {departureCity} → {arrivalCity} has been confirmed. Amount: {totalAmount} {currency}', sw: 'Nafasi yako ya safari {departureCity} → {arrivalCity} imethibitishwa. Kiasi: {totalAmount} {currency}', es: 'Su reserva de viaje {departureCity} → {arrivalCity} ha sido confirmada. Importe: {totalAmount} {currency}' },
  'notification.reservation_created_for_company_title': { fr: 'Nouvelle réservation', en: 'New booking', sw: 'Nafasi mpya', es: 'Nueva reserva' },
  'notification.reservation_created_for_company_content': { fr: 'Nouvelle réservation de voyage {departureCity} → {arrivalCity} par {userFullName}. Montant: {totalAmount} {currency}', en: 'New trip booking {departureCity} → {arrivalCity} by {userFullName}. Amount: {totalAmount} {currency}', sw: 'Nafasi mpya ya safari {departureCity} → {arrivalCity} na {userFullName}. Kiasi: {totalAmount} {currency}', es: 'Nueva reserva de viaje {departureCity} → {arrivalCity} por {userFullName}. Importe: {totalAmount} {currency}' },
  'notification.order_status_changed_title_validated': { fr: '✅ Commande validée', en: '✅ Order validated', sw: '✅ Agizo limethibitishwa', es: '✅ Pedido validado' },
  'notification.order_status_changed_content_validated': { fr: 'Votre commande {invoiceNumber} a été validée et sera traitée sous peu.', en: 'Your order {invoiceNumber} has been validated and will be processed shortly.', sw: 'Agizo lako {invoiceNumber} limethibitishwa na litashughulikiwa hivi karibuni.', es: 'Su pedido {invoiceNumber} ha sido validado y será procesado en breve.' },
  'notification.order_status_changed_title_processing': { fr: '⚙️ Commande en traitement', en: '⚙️ Order in progress', sw: '⚙️ Agizo linashughulikiwa', es: '⚙️ Pedido en proceso' },
  'notification.order_status_changed_content_processing': { fr: 'Votre commande {invoiceNumber} est en cours de traitement.', en: 'Your order {invoiceNumber} is being processed.', sw: 'Agizo lako {invoiceNumber} linashughulikiwa.', es: 'Su pedido {invoiceNumber} está siendo procesado.' },
  'notification.order_status_changed_title_completed': { fr: '🏁 Commande terminée', en: '🏁 Order completed', sw: '🏁 Agizo limekamilika', es: '🏁 Pedido completado' },
  'notification.order_status_changed_content_completed': { fr: 'Votre commande {invoiceNumber} est prête.', en: 'Your order {invoiceNumber} is ready.', sw: 'Agizo lako {invoiceNumber} liko tayari.', es: 'Su pedido {invoiceNumber} está listo.' },
  'notification.order_status_changed_title_delivered': { fr: '🚚 Commande livrée', en: '🚚 Order delivered', sw: '🚚 Agizo limewasilishwa', es: '🚚 Pedido entregado' },
  'notification.order_status_changed_content_delivered': { fr: 'Votre commande {invoiceNumber} a été livrée.', en: 'Your order {invoiceNumber} has been delivered.', sw: 'Agizo lako {invoiceNumber} limewasilishwa.', es: 'Su pedido {invoiceNumber} ha sido entregado.' },
  'notification.order_status_changed_title_rejected': { fr: '❌ Commande rejetée', en: '❌ Order rejected', sw: '❌ Agizo limekataliwa', es: '❌ Pedido rechazado' },
  'notification.order_status_changed_content_rejected': { fr: 'Votre commande {invoiceNumber} a été rejetée.', en: 'Your order {invoiceNumber} has been rejected.', sw: 'Agizo lako {invoiceNumber} limekataliwa.', es: 'Su pedido {invoiceNumber} ha sido rechazado.' },
  'notification.order_status_changed_title_default': { fr: '📢 Mise à jour commande', en: '📢 Order update', sw: '📢 Sasisho la agizo', es: '📢 Actualización de pedido' },
  'notification.order_status_changed_content_default': { fr: 'Le statut de votre commande {invoiceNumber} est passé à {status}.', en: 'The status of your order {invoiceNumber} has changed to {status}.', sw: 'Hali ya agizo lako {invoiceNumber} imebadilika kuwa {status}.', es: 'El estado de su pedido {invoiceNumber} ha cambiado a {status}.' },
  'notification.ride_new_content': { fr: 'Un passager souhaite un trajet depuis {address}', en: 'A passenger wants a ride from {address}', sw: 'Abiria anataka safari kutoka {address}', es: 'Un pasajero desea un viaje desde {address}' },
  'notification.ride_new_content_default': { fr: 'Un passager souhaite un trajet depuis votre zone', en: 'A passenger wants a ride from your area', sw: 'Abiria anataka safari kutoka eneo lako', es: 'Un pasajero desea un viaje desde su área' },
  'notification.ride_accepted_content': { fr: 'Votre course a été acceptée par {driverName}', en: 'Your ride has been accepted by {driverName}', sw: 'Safari yako imekubaliwa na {driverName}', es: 'Tu viaje ha sido aceptado por {driverName}' },
  'notification.ride_accepted_content_default': { fr: 'Votre course a été acceptée par un chauffeur', en: 'Your ride has been accepted by a driver', sw: 'Safari yako imekubaliwa na dereva', es: 'Tu viaje ha sido aceptado por un conductor' },
  'notification.ride_cancelled_content': { fr: 'La course a été annulée', en: 'The ride has been cancelled', sw: 'Safari imefutwa', es: 'El viaje ha sido cancelado' },
  'notification.mark_as_read.not_found': { fr: 'Notification non trouvée', en: 'Notification not found', sw: 'Arifa haipatikani', es: 'Notificación no encontrada' },
  'notification.mark_as_read.already_seen': { fr: 'Notification déjà marquée comme lue', en: 'Notification already marked as read', sw: 'Arifa tayari imewekwa alama ya kusomwa', es: 'Notificación ya marcada como leída' },
  'notification.mark_as_read.success': { fr: 'Notification marquée comme lue', en: 'Notification marked as read', sw: 'Arifa imewekwa alama ya kusomwa', es: 'Notificación marcada como leída' },
  'notification.mark_all_as_read.success': { fr: 'Toutes les notifications ont été marquées comme lues', en: 'All notifications have been marked as read', sw: 'Arifa zote zimewekwa alama ya kusomwa', es: 'Todas las notificaciones han sido marcadas como leídas' },
};

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly gateway: NotificationsGateway,

    @InjectRepository(UserNotification)
    private readonly notificationRepo: Repository<UserNotification>,

    @InjectRepository(UserHasCompanyEntity)
    private readonly userHasCompanyRepo: Repository<UserHasCompanyEntity>,

    @InjectRepository(CompanyHasUserResource)
    private readonly companyHasUserResourceRepo: Repository<CompanyHasUserResource>,
  ) { }

  /** Helper : transforme les données en JSON string si ce n'est pas déjà une string */
  private stringifyData(data: any): string | null {
    if (data === null || data === undefined) return null;
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data);
    } catch (e) {
      console.error('Erreur lors de la sérialisation des données', e);
      return null;
    }
  }

  /** Helper : parse une chaîne JSON si nécessaire */
  private parseData(data: string | null): any {
    if (!data || typeof data !== 'string') return data;
    try {
      return JSON.parse(data);
    } catch (e) {
      return data;
    }
  }

  /** Helper de traduction interne */
  private translate(key: string, lang: string, params?: any): string {
    const translation = translations[key]?.[lang];
    if (!translation) {
      console.warn(`Missing translation for key: ${key}, lang: ${lang}`);
      return key;
    }
    if (typeof translation === 'function') {
      let result = translation(params);
      return result;
    }
    let result = translation;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{${k}}`, 'g'), String(v));
      });
    }
    return result;
  }

  /** Notification à un utilisateur spécifique (WebSocket uniquement) */
  async sendNotificationToUser(
    userId: string,
    title: string,
    message: string,
    type: NotificationType,
    data?: any,
  ) {
    const notification = {
      title,
      message,
      type,
      data: data,
    };
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

  getNotificationTitle(type: NotificationType, lang: string = 'fr'): string {
    const keyMap: Partial<Record<NotificationType, string>> = {
      [NotificationType.SHOP]: 'notification.title.SHOP',
      [NotificationType.DEALER]: 'notification.title.DEALER',
      [NotificationType.FOOD]: 'notification.title.FOOD',
      [NotificationType.SERVICE]: 'notification.title.SERVICE',
      [NotificationType.GROCERY]: 'notification.title.GROCERY',
      [NotificationType.ECOMMERCE]: 'notification.title.ECOMMERCE',
      [NotificationType.PRODUCT]: 'notification.title.PRODUCT',
      [NotificationType.COMPANY]: 'notification.title.COMPANY',
      [NotificationType.NEW_RIDE]: 'notification.title.NEW_RIDE',
      [NotificationType.RIDE_ACCEPTED]: 'notification.title.RIDE_ACCEPTED',
      [NotificationType.RIDE_CANCELLED]: 'notification.title.RIDE_CANCELLED',
      [NotificationType.LOGISTIC]: 'notification.title.LOGISTIC',
      [NotificationType.ORDER_CREATED]: 'notification.title.ORDER_CREATED',
      [NotificationType.ORDER_UPDATED]: 'notification.title.ORDER_UPDATED',
      [NotificationType.SHIPMENT_CREATED]: 'notification.title.SHIPMENT_CREATED',
      [NotificationType.RESERVATION_CREATED]: 'notification.title.RESERVATION_CREATED',
      [NotificationType.WISHLIST]: 'notification.title.WISHLIST',
      [NotificationType.WISHLIST_REMINDER]: 'notification.title.WISHLIST_REMINDER',
      [NotificationType.PROMOTION]: 'notification.title.PROMOTION',
      [NotificationType.NEWSLETTER]: 'notification.title.NEWSLETTER',
      [NotificationType.TRIP_REMINDER]: 'notification.title.TRIP_REMINDER',
      [NotificationType.TRIP_UPDATED]: 'notification.title.TRIP_UPDATED',
      [NotificationType.TRIP_CANCELLED]: 'notification.title.TRIP_CANCELLED',
      [NotificationType.RESERVATION_UPDATED]: 'notification.title.RESERVATION_UPDATED',
      [NotificationType.RESERVATION_CONFIRMED]: 'notification.title.RESERVATION_CONFIRMED',
      [NotificationType.RESERVATION_CANCELLED]: 'notification.title.RESERVATION_CANCELLED',
      [NotificationType.TICKET_SCANNED]: 'notification.title.TICKET_SCANNED',
      [NotificationType.PAYMENT_SUCCESS]: 'notification.title.PAYMENT_SUCCESS',
      [NotificationType.PAYMENT_FAILED]: 'notification.title.PAYMENT_FAILED',
      [NotificationType.STOCK_ALERT]: 'notification.title.STOCK_ALERT',
      [NotificationType.LOW_STOCK]: 'notification.title.LOW_STOCK',
      [NotificationType.REVIEW_REQUEST]: 'notification.title.REVIEW_REQUEST',
      [NotificationType.DELIVERY_UPDATED]: 'notification.title.DELIVERY_UPDATED',
      [NotificationType.DELIVERY_DELIVERED]: 'notification.title.DELIVERY_DELIVERED',
      [NotificationType.PASSWORD_RESET]: 'notification.title.PASSWORD_RESET',
      [NotificationType.LOGIN_ALERT]: 'notification.title.LOGIN_ALERT',
      [NotificationType.ACCOUNT_SUSPENDED]: 'notification.title.ACCOUNT_SUSPENDED',
    };
    const key = keyMap[type];
    if (key) {
      return this.translate(key, lang);
    }
    return this.translate('notification.default_title', lang);
  }

  getRideNotificationContent(ride: any, type: NotificationType, lang: string = 'fr'): string {
    switch (type) {
      case NotificationType.NEW_RIDE:
        const address = ride.pickupLocation?.address;
        if (address) {
          return this.translate('notification.ride_new_content', lang, { address });
        }
        return this.translate('notification.ride_new_content_default', lang);
      case NotificationType.RIDE_ACCEPTED:
        const driverName = ride.driverName || ride.driver?.fullName;
        if (driverName) {
          return this.translate('notification.ride_accepted_content', lang, { driverName });
        }
        return this.translate('notification.ride_accepted_content_default', lang);
      case NotificationType.RIDE_CANCELLED:
        return this.translate('notification.ride_cancelled_content', lang);
      default:
        return this.translate('notification.ride_default_content', lang);
    }
  }

  /** Envoi + sauvegarde en base avec sérialisation JSON */
  async sendAndSaveNotification(
    userId: string,
    title: string,
    content: string,
    type: NotificationType,
    data?: any,
  ) {
    // Envoie le WebSocket ET sauvegarde en base
    await this.sendNotificationToUser(userId, title, content, type, data);

    const notification = this.notificationRepo.create({
      userId,
      title,
      body: content,
      type,
      data: this.stringifyData(data),
      hasSeen: false,
    });

    return this.notificationRepo.save(notification);
  }

  async notifyShipmentCreatedForCompany(
    companyId: string,
    shipmentId: string,
    trackingNumber: string,
    status: string,
    companyType: string,
    company: any,
    lang: string = 'fr',
  ): Promise<void> {
    const userCompanies = await this.userHasCompanyRepo.find({
      where: { company: { id: companyId } },
      relations: ['user', 'resources', 'resources.resource'],
    });

    const title = this.translate('notification.shipment_created_for_company_title', lang, { companyType });
    const content = this.translate('notification.shipment_created_for_company_content', lang, { trackingNumber, companyType });
    const data = {
      shipmentId,
      trackingNumber,
      status,
      companyType,
      companyName: company?.companyName,
      type: 'SHIPMENT_CREATED',
    };

    for (const userCompany of userCompanies) {
      const user = userCompany.user;
      if (!user) continue;

      const hasPermission = await this.hasUserPermissionForCompany(
        user.id,
        companyId,
        'SHIPMENTS',
        'canCreate',
      );

      if (hasPermission) {
        this.gateway.sendShipmentCreatedEvent(user.id, {
          shipmentId,
          trackingNumber,
          status,
        });

        await this.sendAndSaveNotification(
          user.id,
          title,
          content,
          NotificationType.SHIPMENT_CREATED,
          data,
        );
      }
    }
  }

  private async hasUserPermissionForCompany(
    userId: string,
    companyId: string,
    resourceKey: string,
    action: string,
  ): Promise<boolean> {
    const userCompany = await this.userHasCompanyRepo.findOne({
      where: {
        user: { id: userId },
        company: { id: companyId },
      },
    });
    if (!userCompany) return false;

    const permission = await this.companyHasUserResourceRepo
      .createQueryBuilder('perm')
      .leftJoin('perm.userCompany', 'userCompany')
      .leftJoin('perm.resource', 'resource')
      .where('userCompany.id = :userCompanyId', { userCompanyId: userCompany.id })
      .andWhere('resource.name = :resourceKey', { resourceKey })
      .getOne();

    if (!permission) return false;
    if (permission.canManage) return true;

    switch (action) {
      case 'canCreate':
        return permission.canCreate;
      case 'canRead':
        return permission.canRead;
      case 'canUpdate':
        return permission.canUpdate;
      case 'canDelete':
        return permission.canDelete;
      default:
        return false;
    }
  }

  async notifyShipmentCreated(
    userId: string,
    shipmentId: string,
    trackingNumber: string,
    status: string,
    lang: string = 'fr',
  ): Promise<void> {
    const title = this.translate('notification.shipment_created_title', lang);
    const content = this.translate('notification.shipment_created_content', lang, { trackingNumber });
    const data = {
      shipmentId,
      trackingNumber,
      status,
      type: 'SHIPMENT_CREATED',
    };

    await this.sendAndSaveNotification(
      userId,
      title,
      content,
      NotificationType.SHIPMENT_CREATED,
      data,
    );
  }

  async notifyOrderCreated(
    recipientsIds: string[],
    order: OrderEntity,
    lang: string = 'fr',
  ): Promise<void> {
    const title = this.translate('notification.order_created_title', lang);
    const message = this.translate('notification.order_created_content', lang, {
      invoiceNumber: order.invoiceNumber,
      totalAmount: order.totalAmount,
      currency: order.currency,
    });
    const data = {
      orderId: order.id,
      invoiceNumber: order.invoiceNumber,
      totalAmount: order.totalAmount,
      currency: order.currency,
      type: order.type,
    };

    for (const userId of recipientsIds) {
      await this.sendAndSaveNotification(
        userId,
        title,
        message,
        order.type as any,
        data,
      );
    }
  }

  async notifyReservationCreated(
    userId: string,
    reservationId: string,
    totalAmount: number,
    currency: string,
    departureCity: string,
    arrivalCity: string,
    lang: string = 'fr',
  ): Promise<void> {
    const title = this.translate('notification.reservation_confirmed_title', lang);
    const content = this.translate('notification.reservation_confirmed_content', lang, {
      departureCity,
      arrivalCity,
      totalAmount,
      currency,
    });
    const data = {
      reservationId,
      totalAmount,
      currency,
      departureCity,
      arrivalCity,
      type: 'RESERVATION_CREATED',
    };

    await this.sendAndSaveNotification(
      userId,
      title,
      content,
      NotificationType.RESERVATION_CREATED,
      data,
    );
  }

  async notifyReservationCreatedForCompany(
    companyId: string,
    reservationId: string,
    totalAmount: number,
    currency: string,
    departureCity: string,
    arrivalCity: string,
    userFullName: string,
    lang: string = 'fr',
  ): Promise<void> {
    const userCompanies = await this.userHasCompanyRepo.find({
      where: { company: { id: companyId } },
      relations: ['user', 'resources', 'resources.resource'],
    });

    const title = this.translate('notification.reservation_created_for_company_title', lang);
    const content = this.translate('notification.reservation_created_for_company_content', lang, {
      departureCity,
      arrivalCity,
      userFullName,
      totalAmount,
      currency,
    });
    const data = {
      reservationId,
      totalAmount,
      currency,
      departureCity,
      arrivalCity,
      userFullName,
      type: 'RESERVATION_CREATED_FOR_COMPANY',
    };

    for (const userCompany of userCompanies) {
      const user = userCompany.user;
      if (!user) continue;

      const hasPermission = await this.hasUserPermissionForCompany(
        user.id,
        companyId,
        'RESERVATIONS',
        'canRead',
      );

      if (hasPermission) {
        await this.sendAndSaveNotification(
          user.id,
          title,
          content,
          NotificationType.RESERVATION_CREATED,
          data,
        );
      }
    }
  }

  async notifyOrderStatusChanged(
    buyerId: string,
    order: OrderEntity,
    newStatus: string,
    lang: string = 'fr',
  ): Promise<void> {
    let titleKey: string;
    let contentKey: string;

    switch (newStatus) {
      case 'VALIDATED':
        titleKey = 'notification.order_status_changed_title_validated';
        contentKey = 'notification.order_status_changed_content_validated';
        break;
      case 'PROCESSING':
        titleKey = 'notification.order_status_changed_title_processing';
        contentKey = 'notification.order_status_changed_content_processing';
        break;
      case 'COMPLETED':
        titleKey = 'notification.order_status_changed_title_completed';
        contentKey = 'notification.order_status_changed_content_completed';
        break;
      case 'DELIVERED':
        titleKey = 'notification.order_status_changed_title_delivered';
        contentKey = 'notification.order_status_changed_content_delivered';
        break;
      case 'REJECTED':
        titleKey = 'notification.order_status_changed_title_rejected';
        contentKey = 'notification.order_status_changed_content_rejected';
        break;
      default:
        titleKey = 'notification.order_status_changed_title_default';
        contentKey = 'notification.order_status_changed_content_default';
    }

    const title = this.translate(titleKey, lang);
    const message = this.translate(contentKey, lang, { invoiceNumber: order.invoiceNumber, status: newStatus });

    await this.sendAndSaveNotification(
      buyerId,
      title,
      message,
      order.type as any,
      {
        orderId: order.id,
        status: newStatus,
        invoiceNumber: order.invoiceNumber,
      },
    );
  }

  async markAsRead(
    notificationId: string,
    userId: string,
    lang: string = 'fr',
  ): Promise<{ message: string }> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException(this.translate('notification.mark_as_read.not_found', lang));
    }

    if (notification.hasSeen) {
      return { message: this.translate('notification.mark_as_read.already_seen', lang) };
    }

    await this.notificationRepo.update(notification.id, {
      hasSeen: true,
    });

    return { message: this.translate('notification.mark_as_read.success', lang) };
  }

  async markAllAsRead(userId: string, lang: string = 'fr'): Promise<{ message: string }> {
    await this.notificationRepo.update(
      { userId, hasSeen: false },
      { hasSeen: true },
    );
    return { message: this.translate('notification.mark_all_as_read.success', lang) };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationRepo.count({
      where: { userId, hasSeen: false },
    });
    return { count };
  }

  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: UserNotification[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const [notifications, total] = await this.notificationRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const parsedNotifications = notifications.map((notif) => ({
      ...notif,
      data: this.parseData(notif.data),
    }));

    return {
      data: parsedNotifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateNotificationData(
    notificationId: string,
    newData: any,
  ): Promise<void> {
    await this.notificationRepo.update(
      { id: notificationId },
      { data: this.stringifyData(newData) },
    );
  }
}