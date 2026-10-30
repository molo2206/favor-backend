export enum NotificationType {
  SHOP = 'shop',
  DEALER = 'dealer',
  FOOD = 'food',
  SERVICE = 'service',
  GROCERY = 'grocery',
  ECOMMERCE = 'ecommerce',
  PRODUCT = 'product',
  COMPANY = 'company',
  NEW_RIDE = 'new_ride',
  RIDE_ACCEPTED = 'ride_accepted',
  RIDE_CANCELLED = 'ride_cancelled',
  // ✅ AJOUT : cycle complet d'une course (type Bolt)
  RIDE_DRIVER_ARRIVED = 'ride_driver_arrived',
  RIDE_STARTED = 'ride_started',
  RIDE_COMPLETED = 'ride_completed',
  RIDE_NO_DRIVER = 'ride_no_driver',
  RIDE_SEARCHING = 'ride_searching',
  RIDE_PAYMENT = 'ride_payment', // ✅ paiement de la course (reçu / échoué)
  RIDE_CHAT_MESSAGE = 'ride_chat_message', // ✅ message du chat chauffeur ↔ client (texte / vocal)
  VEHICLE_KYC = 'vehicle_kyc', // ✅ documents du véhicule validés / refusés / modifiés par l'admin
  // ✅ AJOUT : BackOffice Média (équipe affectée, planning, projets)
  MEDIA_ASSIGNMENT = 'media_assignment',
  MEDIA_PROJECT_UPDATE = 'media_project_update',
  // ✅ AJOUT : annonces (type Jiji)
  CLASSIFIED_UPDATE = 'classified_update',
  LOGISTIC = 'LOGISTIC',
  ORDER_CREATED = 'order_created',
  ORDER_UPDATED = 'order_updated',//order_updated
  SHIPMENT_CREATED = 'shipment_created',
  RESERVATION_CREATED = 'reservation_created',

  WISHLIST = 'wishlist',
  WISHLIST_REMINDER = 'wishlist_reminder',
  PROMOTION = 'promotion',
  NEWSLETTER = 'newsletter',
  TRIP_REMINDER = 'trip_reminder',
  TRIP_UPDATED = 'trip_updated',
  TRIP_CANCELLED = 'trip_cancelled',
  RESERVATION_UPDATED = 'reservation_updated',
  RESERVATION_CONFIRMED = 'reservation_confirmed',
  RESERVATION_CANCELLED = 'reservation_cancelled',
  TICKET_SCANNED = 'ticket_scanned',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  STOCK_ALERT = 'stock_alert',
  LOW_STOCK = 'low_stock',
  REVIEW_REQUEST = 'review_request',
  DELIVERY_UPDATED = 'delivery_updated',
  DELIVERY_DELIVERED = 'delivery_delivered',
  /** ✅ Nouvelle commande restaurant pour les livreurs de la branche */
  DELIVERY_NEW_ORDER = 'delivery_new_order',
  PASSWORD_RESET = 'password_reset',
  LOGIN_ALERT = 'login_alert',
  ACCOUNT_SUSPENDED = 'account_suspended',

  SHIPMENT_REMINDER = 'shipment_reminder',
  SHIPMENT_TRACKING = 'shipment_tracking',
  SHIPMENT_PROMOTION = 'shipment_promotion',
  HOME_DELIVERY = 'home_delivery',
  LTA_NEW_ROUTES = 'lta_new_routes',
  LTA_PENDING = 'lta_pending',

  SERVICE_NEW = 'service_new',
  SERVICE_POPULAR = 'service_popular',

  HOTEL_REMINDER = 'hotel_reminder',
  HOTEL_CHECKOUT = 'hotel_checkout',

  PRESTATAIRE_NEW = 'prestataire_new',
  PRESTATAIRE_REMINDER = 'prestataire_reminder',

  // 💬 Chat back-office (employés)
  CHAT_MESSAGE = 'chat_message',
  CHAT_MENTION = 'chat_mention',
  CHAT_REPLY = 'chat_reply',
  CHAT_REACTION = 'chat_reaction',
  CHAT_GROUP_ADDED = 'chat_group_added',
  CHAT_GROUP_REMOVED = 'chat_group_removed',
}

/** Types de notifications appartenant au chat back-office */
export const CHAT_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.CHAT_MESSAGE,
  NotificationType.CHAT_MENTION,
  NotificationType.CHAT_REPLY,
  NotificationType.CHAT_REACTION,
  NotificationType.CHAT_GROUP_ADDED,
  NotificationType.CHAT_GROUP_REMOVED,
];

/** Catégories utilisables pour filtrer GET /notifications?category=... */
export const NOTIFICATION_CATEGORIES: Record<string, NotificationType[]> = {
  chat: CHAT_NOTIFICATION_TYPES,
};
