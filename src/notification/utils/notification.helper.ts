/* eslint-disable no-case-declarations */
// src/notification/utils/notification.helper.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationType } from '../type/notification.type';
import { RideNotificationData } from './types';
import { NotificationsService } from '../notifications.service';
import { UserNotification } from 'src/firebase/entities/user-notification.entity';

export const typeCompanyToNotificationType: Record<string, NotificationType> = {
  RESTAURANT: NotificationType.FOOD,
  CAR: NotificationType.DEALER,
  GROCERY: NotificationType.GROCERY,
  SHOP: NotificationType.SHOP,
  SERVICE: NotificationType.SERVICE,
  WHOLESALER: NotificationType.ECOMMERCE,
  WHOLESALER_RETAILER: NotificationType.ECOMMERCE,
  COMPANY: NotificationType.COMPANY,
  NEW_RIDE: NotificationType.NEW_RIDE,
  RIDE_ACCEPTED: NotificationType.RIDE_ACCEPTED,
  RIDE_CANCELLED: NotificationType.RIDE_CANCELLED,
};

@Injectable()
export class NotificationHelper {
  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectRepository(UserNotification)
    private readonly notificationRepo: Repository<UserNotification>,
  ) { }

  getNotificationTypeFromCompanyType(companyType: string): NotificationType {
    return typeCompanyToNotificationType[companyType] || NotificationType.COMPANY;
  }

  // ----------------------------------------------------------------------
  // Traductions des titres (fonctions)
  // ----------------------------------------------------------------------
  private getTitleTranslations(): Record<string, Record<string, (data: any) => string>> {
    return {
      [NotificationType.SHOP]: {
        fr: (data) => data?.companyName ? `Nouvelle notification de ${data.companyName}` : 'Nouvelle notification boutique',
        en: (data) => data?.companyName ? `New notification from ${data.companyName}` : 'New shop notification',
        sw: (data) => data?.companyName ? `Arifa mpya kutoka ${data.companyName}` : 'Arifa mpya ya duka',
        es: (data) => data?.companyName ? `Nueva notificación de ${data.companyName}` : 'Nueva notificación de tienda',
      },
      [NotificationType.DEALER]: {
        fr: (data) => data?.companyName ? `Nouvelle notification de ${data.companyName}` : 'Nouvelle notification concessionnaire',
        en: (data) => data?.companyName ? `New notification from ${data.companyName}` : 'New dealer notification',
        sw: (data) => data?.companyName ? `Arifa mpya kutoka ${data.companyName}` : 'Arifa mpya ya muuzaji',
        es: (data) => data?.companyName ? `Nueva notificación de ${data.companyName}` : 'Nueva notificación de concesionario',
      },
      [NotificationType.FOOD]: {
        fr: (data) => data?.companyName ? `${data.companyName} - Nouvelle notification` : 'Nouvelle notification restaurant',
        en: (data) => data?.companyName ? `${data.companyName} - New notification` : 'New restaurant notification',
        sw: (data) => data?.companyName ? `${data.companyName} - Arifa mpya` : 'Arifa mpya ya mgahawa',
        es: (data) => data?.companyName ? `${data.companyName} - Nueva notificación` : 'Nueva notificación de restaurante',
      },
      [NotificationType.SERVICE]: {
        fr: (data) => data?.companyName ? `Nouvelle notification de ${data.companyName}` : 'Nouvelle notification service',
        en: (data) => data?.companyName ? `New notification from ${data.companyName}` : 'New service notification',
        sw: (data) => data?.companyName ? `Arifa mpya kutoka ${data.companyName}` : 'Arifa mpya ya huduma',
        es: (data) => data?.companyName ? `Nueva notificación de ${data.companyName}` : 'Nueva notificación de servicio',
      },
      [NotificationType.GROCERY]: {
        fr: (data) => data?.companyName ? `${data.companyName} - Nouvelle notification` : 'Nouvelle notification épicerie',
        en: (data) => data?.companyName ? `${data.companyName} - New notification` : 'New grocery notification',
        sw: (data) => data?.companyName ? `${data.companyName} - Arifa mpya` : 'Arifa mpya ya mboga',
        es: (data) => data?.companyName ? `${data.companyName} - Nueva notificación` : 'Nueva notificación de tienda de comestibles',
      },
      [NotificationType.ECOMMERCE]: {
        fr: (data) => data?.companyName ? `${data.companyName} - Nouvelle notification` : 'Nouvelle notification e-commerce',
        en: (data) => data?.companyName ? `${data.companyName} - New notification` : 'New e-commerce notification',
        sw: (data) => data?.companyName ? `${data.companyName} - Arifa mpya` : 'Arifa mpya ya e-commerce',
        es: (data) => data?.companyName ? `${data.companyName} - Nueva notificación` : 'Nueva notificación de e-commerce',
      },
      [NotificationType.PRODUCT]: {
        fr: (data) => data?.productName ? `Nouveau produit: ${data.productName}` : (data?.companyName ? `${data.companyName} - Nouveau produit` : 'Nouveau produit'),
        en: (data) => data?.productName ? `New product: ${data.productName}` : (data?.companyName ? `${data.companyName} - New product` : 'New product'),
        sw: (data) => data?.productName ? `Bidhaa mpya: ${data.productName}` : (data?.companyName ? `${data.companyName} - Bidhaa mpya` : 'Bidhaa mpya'),
        es: (data) => data?.productName ? `Nuevo producto: ${data.productName}` : (data?.companyName ? `${data.companyName} - Nuevo producto` : 'Nuevo producto'),
      },
      [NotificationType.COMPANY]: {
        fr: (data) => data?.companyName ? `Notification de ${data.companyName}` : 'Nouvelle notification entreprise',
        en: (data) => data?.companyName ? `Notification from ${data.companyName}` : 'New company notification',
        sw: (data) => data?.companyName ? `Arifa kutoka ${data.companyName}` : 'Arifa mpya ya kampuni',
        es: (data) => data?.companyName ? `Notificación de ${data.companyName}` : 'Nueva notificación de empresa',
      },
      [NotificationType.NEW_RIDE]: {
        fr: (data) => data?.pickupLocation?.address ? `Nouvelle course vers ${data.pickupLocation.address}` : 'Nouvelle course disponible',
        en: (data) => data?.pickupLocation?.address ? `New ride to ${data.pickupLocation.address}` : 'New ride available',
        sw: (data) => data?.pickupLocation?.address ? `Safari mpya kwenda ${data.pickupLocation.address}` : 'Safari mpya inapatikana',
        es: (data) => data?.pickupLocation?.address ? `Nuevo viaje hacia ${data.pickupLocation.address}` : 'Nuevo viaje disponible',
      },
      [NotificationType.RIDE_ACCEPTED]: {
        fr: (data) => data?.driverName ? `Course acceptée par ${data.driverName}` : 'Course acceptée',
        en: (data) => data?.driverName ? `Ride accepted by ${data.driverName}` : 'Ride accepted',
        sw: (data) => data?.driverName ? `Safari imekubaliwa na ${data.driverName}` : 'Safari imekubaliwa',
        es: (data) => data?.driverName ? `Viaje aceptado por ${data.driverName}` : 'Viaje aceptado',
      },
      [NotificationType.RIDE_CANCELLED]: {
        fr: (data) => data?.reason ? `Course annulée: ${data.reason}` : 'Course annulée',
        en: (data) => data?.reason ? `Ride cancelled: ${data.reason}` : 'Ride cancelled',
        sw: (data) => data?.reason ? `Safari imefutwa: ${data.reason}` : 'Safari imefutwa',
        es: (data) => data?.reason ? `Viaje cancelado: ${data.reason}` : 'Viaje cancelado',
      },
      [NotificationType.LOGISTIC]: {
        fr: (data) => data?.companyName ? `Logistique - ${data.companyName}` : (data?.trackingNumber ? `Colis ${data.trackingNumber}` : 'Notification logistique'),
        en: (data) => data?.companyName ? `Logistics - ${data.companyName}` : (data?.trackingNumber ? `Parcel ${data.trackingNumber}` : 'Logistics notification'),
        sw: (data) => data?.companyName ? `Logistics - ${data.companyName}` : (data?.trackingNumber ? `Mfuko ${data.trackingNumber}` : 'Arifa ya vifaa'),
        es: (data) => data?.companyName ? `Logística - ${data.companyName}` : (data?.trackingNumber ? `Paquete ${data.trackingNumber}` : 'Notificación logística'),
      },
      [NotificationType.ORDER_CREATED]: {
        fr: () => 'Nouvelle commande',
        en: () => 'New order',
        sw: () => 'Agizo jipya',
        es: () => 'Nuevo pedido',
      },
      [NotificationType.ORDER_UPDATED]: {
        fr: () => 'Mise à jour commande',
        en: () => 'Order update',
        sw: () => 'Sasisho la agizo',
        es: () => 'Actualización de pedido',
      },
      [NotificationType.SHIPMENT_CREATED]: {
        fr: (data) => data?.trackingNumber ? `Nouveau colis ${data.trackingNumber}` : 'Nouveau colis créé',
        en: (data) => data?.trackingNumber ? `New parcel ${data.trackingNumber}` : 'New parcel created',
        sw: (data) => data?.trackingNumber ? `Mfuko mpya ${data.trackingNumber}` : 'Mfuko mpya umeundwa',
        es: (data) => data?.trackingNumber ? `Nuevo paquete ${data.trackingNumber}` : 'Nuevo paquete creado',
      },
      [NotificationType.RESERVATION_CREATED]: {
        fr: (data) => data?.departureCity && data?.arrivalCity ? `Réservation ${data.departureCity} → ${data.arrivalCity}` : (data?.companyName ? `Nouvelle réservation - ${data.companyName}` : 'Nouvelle réservation'),
        en: (data) => data?.departureCity && data?.arrivalCity ? `Booking ${data.departureCity} → ${data.arrivalCity}` : (data?.companyName ? `New booking - ${data.companyName}` : 'New booking'),
        sw: (data) => data?.departureCity && data?.arrivalCity ? `Nafasi ${data.departureCity} → ${data.arrivalCity}` : (data?.companyName ? `Nafasi mpya - ${data.companyName}` : 'Nafasi mpya'),
        es: (data) => data?.departureCity && data?.arrivalCity ? `Reserva ${data.departureCity} → ${data.arrivalCity}` : (data?.companyName ? `Nueva reserva - ${data.companyName}` : 'Nueva reserva'),
      },
      // Ajoutez ici les autres types si nécessaire (WISHLIST, PROMOTION, etc.)
    };
  }

  // ----------------------------------------------------------------------
  // Traductions des contenus (fonctions)
  // ----------------------------------------------------------------------
  private getContentTranslations(): Record<string, Record<string, (data: any) => string>> {
    return {
      [NotificationType.ORDER_CREATED]: {
        fr: (data) => data?.message || `Nouvelle commande ${data?.invoiceNumber || ''} créée`,
        en: (data) => data?.message || `New order ${data?.invoiceNumber || ''} created`,
        sw: (data) => data?.message || `Agizo jipya ${data?.invoiceNumber || ''} limeundwa`,
        es: (data) => data?.message || `Nuevo pedido ${data?.invoiceNumber || ''} creado`,
      },
      [NotificationType.ORDER_UPDATED]: {
        fr: (data) => data?.message || `Commande ${data?.invoiceNumber || ''} mise à jour`,
        en: (data) => data?.message || `Order ${data?.invoiceNumber || ''} updated`,
        sw: (data) => data?.message || `Agizo ${data?.invoiceNumber || ''} limesasishwa`,
        es: (data) => data?.message || `Pedido ${data?.invoiceNumber || ''} actualizado`,
      },
      [NotificationType.PAYMENT_SUCCESS]: {
        fr: (data) => `Paiement confirmé pour ${data?.invoiceNumber || 'votre commande'}`,
        en: (data) => `Payment confirmed for ${data?.invoiceNumber || 'your order'}`,
        sw: (data) => `Malipo yamethibitishwa kwa ${data?.invoiceNumber || 'agizo lako'}`,
        es: (data) => `Pago confirmado para ${data?.invoiceNumber || 'tu pedido'}`,
      },
      [NotificationType.PAYMENT_FAILED]: {
        fr: () => 'Le paiement a échoué. Veuillez réessayer.',
        en: () => 'Payment failed. Please try again.',
        sw: () => 'Malipo yameshindwa. Tafadhali jaribu tena.',
        es: () => 'El pago falló. Por favor, inténtelo de nuevo.',
      },
      // Ajoutez d'autres types selon vos besoins
    };
  }

  private getDefaultTitle(type: NotificationType, data: any, lang: string): string {
    const map: Record<string, Record<string, string>> = {
      SHOP: { fr: 'Boutique', en: 'Shop', sw: 'Duka', es: 'Tienda' },
      DEALER: { fr: 'Concessionnaire', en: 'Dealer', sw: 'Muuzaji', es: 'Concesionario' },
      FOOD: { fr: 'Restaurant', en: 'Restaurant', sw: 'Mgahawa', es: 'Restaurante' },
      SERVICE: { fr: 'Service', en: 'Service', sw: 'Huduma', es: 'Servicio' },
      GROCERY: { fr: 'Épicerie', en: 'Grocery', sw: 'Mboga', es: 'Tienda de comestibles' },
      ECOMMERCE: { fr: 'E-commerce', en: 'E-commerce', sw: 'E-commerce', es: 'E-commerce' },
      PRODUCT: { fr: 'Produit', en: 'Product', sw: 'Bidhaa', es: 'Producto' },
      COMPANY: { fr: 'Entreprise', en: 'Company', sw: 'Kampuni', es: 'Empresa' },
      NEW_RIDE: { fr: 'Course', en: 'Ride', sw: 'Safari', es: 'Viaje' },
      RIDE_ACCEPTED: { fr: 'Course acceptée', en: 'Ride accepted', sw: 'Safari imekubaliwa', es: 'Viaje aceptado' },
      RIDE_CANCELLED: { fr: 'Course annulée', en: 'Ride cancelled', sw: 'Safari imefutwa', es: 'Viaje cancelado' },
      LOGISTIC: { fr: 'Logistique', en: 'Logistics', sw: 'Vifaa', es: 'Logística' },
      ORDER_CREATED: { fr: 'Commande', en: 'Order', sw: 'Agizo', es: 'Pedido' },
      SHIPMENT_CREATED: { fr: 'Colis', en: 'Parcel', sw: 'Mfuko', es: 'Paquete' },
      RESERVATION_CREATED: { fr: 'Réservation', en: 'Booking', sw: 'Nafasi', es: 'Reserva' },
    };
    const typeKey = type as keyof typeof map;
    const typeName = map[typeKey]?.[lang] || type;
    if (data?.companyName) {
      const prefix = { fr: 'Notification de', en: 'Notification from', sw: 'Arifa kutoka', es: 'Notificación de' }[lang];
      return `${prefix} ${data.companyName}`;
    }
    return `Nouvelle notification ${typeName}`.trim();
  }

  // ----------------------------------------------------------------------
  // Méthodes publiques
  // ----------------------------------------------------------------------
  getNotificationTitle(type: NotificationType, lang: string, data?: any): string {
    const titles = this.getTitleTranslations();
    const fn = titles[type]?.[lang];
    if (fn) return fn(data);
    return this.getDefaultTitle(type, data, lang);
  }

  getNotificationContent(type: NotificationType, lang: string, data?: any): string {
    // Cas spéciaux complexes (Ride, Reservation, etc.)
    switch (type) {
      case NotificationType.RESERVATION_CREATED:
        if (data?.forCompany) {
          const templates = {
            fr: `Nouvelle réservation de ${data.userFullName || 'un client'} pour le trajet ${data.departureCity || ''} → ${data.arrivalCity || ''}. Montant: ${data.totalAmount || 0} ${data.currency || 'USD'}`,
            en: `New booking from ${data.userFullName || 'a customer'} for trip ${data.departureCity || ''} → ${data.arrivalCity || ''}. Amount: ${data.totalAmount || 0} ${data.currency || 'USD'}`,
            sw: `Nafasi mpya kutoka kwa ${data.userFullName || 'mteja'} kwa safari ${data.departureCity || ''} → ${data.arrivalCity || ''}. Kiasi: ${data.totalAmount || 0} ${data.currency || 'USD'}`,
            es: `Nueva reserva de ${data.userFullName || 'un cliente'} para el viaje ${data.departureCity || ''} → ${data.arrivalCity || ''}. Importe: ${data.totalAmount || 0} ${data.currency || 'USD'}`,
          };
          return templates[lang];
        } else {
          const templates = {
            fr: `Votre réservation pour le trajet ${data?.departureCity || ''} → ${data?.arrivalCity || ''} est ${data?.status === 'CONFIRMED' ? 'confirmée' : 'créée'}. Montant: ${data?.totalAmount || 0} ${data?.currency || 'USD'}. ${data?.pin ? `PIN: ${data.pin}` : ''} Bon voyage !`,
            en: `Your booking for trip ${data?.departureCity || ''} → ${data?.arrivalCity || ''} is ${data?.status === 'CONFIRMED' ? 'confirmed' : 'created'}. Amount: ${data?.totalAmount || 0} ${data?.currency || 'USD'}. ${data?.pin ? `PIN: ${data.pin}` : ''} Have a nice trip!`,
            sw: `Nafasi yako ya safari ${data?.departureCity || ''} → ${data?.arrivalCity || ''} ime ${data?.status === 'CONFIRMED' ? 'thibitishwa' : 'undwa'}. Kiasi: ${data?.totalAmount || 0} ${data?.currency || 'USD'}. ${data?.pin ? `PIN: ${data.pin}` : ''} Safari njema!`,
            es: `Su reserva para el viaje ${data?.departureCity || ''} → ${data?.arrivalCity || ''} está ${data?.status === 'CONFIRMED' ? 'confirmada' : 'creada'}. Importe: ${data?.totalAmount || 0} ${data?.currency || 'USD'}. ${data?.pin ? `PIN: ${data.pin}` : ''} ¡Buen viaje!`,
          };
          return templates[lang];
        }

      case NotificationType.NEW_RIDE:
        return this.getNewRideContent(data, lang);
      case NotificationType.RIDE_ACCEPTED:
        return this.getRideAcceptedContent(data, lang);
      case NotificationType.RIDE_CANCELLED:
        return this.getRideCancelledContent(data, lang);

      default:
        const contentMap = this.getContentTranslations();
        const fn = contentMap[type]?.[lang];
        if (fn) return fn(data);
        const fallback = {
          fr: data?.message || 'Vous avez reçu une nouvelle notification',
          en: data?.message || 'You have received a new notification',
          sw: data?.message || 'Umepokea arifa mpya',
          es: data?.message || 'Has recibido una nueva notificación',
        };
        return fallback[lang];
    }
  }

  async sendNotification(
    notificationsService: NotificationsService,
    userId: string,
    type: NotificationType,
    lang: string,
    data?: any,
    entity?: string,
    entityId?: string,
  ) {
    const title = this.getNotificationTitle(type, lang, data);
    const content = this.getNotificationContent(type, lang, data);

    console.log(`Sending notification via helper to ${userId}`);
    console.log(`   Type: ${type}`);
    console.log(`   Title: ${title}`);
    console.log(`   Content: ${content}`);

    const webSocketData = { ...data };
    if (entity) webSocketData.entity = entity;
    if (entityId) webSocketData.entityId = entityId;

    await notificationsService.sendNotificationToUser(
      userId,
      title,
      content,
      type,
      webSocketData,
    );

    try {
      const dataToStore = { ...data };
      if (entity) dataToStore.entity = entity;
      if (entityId) dataToStore.entityId = entityId;

      const notification = this.notificationRepo.create({
        userId,
        title,
        body: content,
        type: type,
        data: JSON.stringify(dataToStore),
        hasSeen: false,
      });
      await this.notificationRepo.save(notification);
      console.log(`Notification saved to database for user ${userId}`);
    } catch (error) {
      console.error(`❌ Error saving notification:`, error.message);
    }
  }

  async sendReservationNotification(
    notificationsService: NotificationsService,
    userId: string,
    lang: string,
    data: {
      reservationId: string;
      departureCity: string;
      arrivalCity: string;
      totalAmount: number;
      currency: string;
      status: string;
      pin?: string;
      userFullName?: string;
      forCompany?: boolean;
    },
    entity?: string,
    entityId?: string,
  ) {
    return this.sendNotification(
      notificationsService,
      userId,
      NotificationType.RESERVATION_CREATED,
      lang,
      data,
      entity || 'RESERVATION',
      entityId || data.reservationId,
    );
  }

  async sendCompanyNotification(
    notificationsService: NotificationsService,
    userId: string,
    companyType: string,
    companyName: string,
    message: string,
    lang: string,
    additionalData?: any,
    entity?: string,
    entityId?: string,
  ) {
    const type = this.getNotificationTypeFromCompanyType(companyType);
    return this.sendNotification(
      notificationsService,
      userId,
      type,
      lang,
      { companyName, message, ...additionalData },
      entity,
      entityId,
    );
  }

  // ----------------------------------------------------------------------
  // Méthodes privées de formatage (Ride)
  // ----------------------------------------------------------------------
  private getNewRideContent(data: RideNotificationData, lang: string): string {
    const pickup = data?.pickupLocation?.address;
    const dropoff = data?.dropoffLocation?.address;
    const distance = typeof data?.distance === 'number' ? `${data.distance} km` : '';
    const duration = typeof data?.duration === 'number' ? `${data.duration} min` : '';
    const price = typeof data?.price === 'number' ? `${data.price} FCFA` : '';
    const details = [distance, duration, price].filter(Boolean).join(', ');

    if (pickup && dropoff) {
      const templates = {
        fr: `Trajet de ${pickup} vers ${dropoff}${details ? ` (${details})` : ''}`,
        en: `Trip from ${pickup} to ${dropoff}${details ? ` (${details})` : ''}`,
        sw: `Safari kutoka ${pickup} hadi ${dropoff}${details ? ` (${details})` : ''}`,
        es: `Viaje de ${pickup} a ${dropoff}${details ? ` (${details})` : ''}`,
      };
      return templates[lang];
    } else if (pickup) {
      const templates = {
        fr: `Prise en charge à ${pickup}${details ? ` (${details})` : ''}`,
        en: `Pickup at ${pickup}${details ? ` (${details})` : ''}`,
        sw: `Kuchukua katika ${pickup}${details ? ` (${details})` : ''}`,
        es: `Recogida en ${pickup}${details ? ` (${details})` : ''}`,
      };
      return templates[lang];
    } else {
      const templates = {
        fr: `Nouvelle course disponible${details ? ` (${details})` : ''}`,
        en: `New ride available${details ? ` (${details})` : ''}`,
        sw: `Safari mpya inapatikana${details ? ` (${details})` : ''}`,
        es: `Nuevo viaje disponible${details ? ` (${details})` : ''}`,
      };
      return templates[lang];
    }
  }

  private getRideAcceptedContent(data: RideNotificationData, lang: string): string {
    let driverName = 'Un chauffeur';
    if (data?.driver?.fullName) driverName = data.driver.fullName;
    else if (data?.driverFullName) driverName = data.driverFullName;
    else if (data?.driverName) driverName = data.driverName;

    const pickup = data?.pickupLocation?.address;
    const distance = typeof data?.distance === 'number' ? `${data.distance} km` : '';
    const duration = typeof data?.duration === 'number' ? `${data.duration} min` : '';
    const details = [distance, duration].filter(Boolean).join(', ');

    if (pickup) {
      const templates = {
        fr: `${driverName} a accepté votre course - Prise en charge à ${pickup}${details ? ` (${details})` : ''}`,
        en: `${driverName} accepted your ride - Pickup at ${pickup}${details ? ` (${details})` : ''}`,
        sw: `${driverName} amekubali safari yako - Kuchukua katika ${pickup}${details ? ` (${details})` : ''}`,
        es: `${driverName} aceptó tu viaje - Recogida en ${pickup}${details ? ` (${details})` : ''}`,
      };
      return templates[lang];
    } else {
      const templates = {
        fr: `${driverName} a accepté votre course${details ? ` (${details})` : ''}`,
        en: `${driverName} accepted your ride${details ? ` (${details})` : ''}`,
        sw: `${driverName} amekubali safari yako${details ? ` (${details})` : ''}`,
        es: `${driverName} aceptó tu viaje${details ? ` (${details})` : ''}`,
      };
      return templates[lang];
    }
  }

  private getRideCancelledContent(data: RideNotificationData, lang: string): string {
    const templatesByReason: Record<string, Record<string, string>> = {
      RIDER: { fr: 'Le passager a annulé la course', en: 'The passenger cancelled the ride', sw: 'Abiria amefuta safari', es: 'El pasajero canceló el viaje' },
      DRIVER: { fr: 'Le chauffeur a annulé la course', en: 'The driver cancelled the ride', sw: 'Dereva amefuta safari', es: 'El conductor canceló el viaje' },
      SYSTEM: { fr: 'La course a été annulée par le système', en: 'The ride was cancelled by the system', sw: 'Safari imefutwa na mfumo', es: 'El viaje fue cancelado por el sistema' },
    };
    if (data?.cancelledBy && templatesByReason[data.cancelledBy]) {
      return templatesByReason[data.cancelledBy][lang];
    }
    if (data?.companyName) {
      const templates = {
        fr: `Course ${data.companyName} annulée`,
        en: `Ride ${data.companyName} cancelled`,
        sw: `Safari ${data.companyName} imefutwa`,
        es: `Viaje ${data.companyName} cancelado`,
      };
      return templates[lang];
    }
    const defaultMsg = { fr: 'La course a été annulée', en: 'The ride has been cancelled', sw: 'Safari imefutwa', es: 'El viaje ha sido cancelado' };
    return defaultMsg[lang];
  }
}