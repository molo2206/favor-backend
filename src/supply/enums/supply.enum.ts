/** Étapes d'un Supply (commande → shipment → expédition → réception) */
export enum SupplyStatus {
  PENDING = 'PENDING', // créé depuis la commande
  PREPARING = 'PREPARING', // préparation chez le vendeur
  READY_TO_SHIP = 'READY_TO_SHIP', // prêt à être transformé en shipment
  SHIPMENT_CREATED = 'SHIPMENT_CREATED', // la commande est devenue un shipment
  IN_TRANSIT = 'IN_TRANSIT', // en cours d'expédition
  ARRIVED = 'ARRIVED', // arrivé à destination
  RECEIVED_AT_BRANCH = 'RECEIVED_AT_BRANCH', // réceptionné dans une branche (en stock)
  COMPLETED = 'COMPLETED', // retiré / livré au client
  CANCELLED = 'CANCELLED',
}

/** Types d'événements de l'historique */
export enum SupplyEventType {
  SUPPLY_CREATED = 'SUPPLY_CREATED',
  SUPPLY_STATUS_CHANGED = 'SUPPLY_STATUS_CHANGED',
  ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
  SHIPMENT_CREATED = 'SHIPMENT_CREATED',
  SHIPMENT_STATUS_CHANGED = 'SHIPMENT_STATUS_CHANGED',
  SHIPMENT_TRACKING = 'SHIPMENT_TRACKING',
  ADDED_TO_LTA = 'ADDED_TO_LTA',
  LTA_TRACKING = 'LTA_TRACKING',
  RECEIVED_AT_BRANCH = 'RECEIVED_AT_BRANCH',
  STOCK_MOVEMENT = 'STOCK_MOVEMENT',
  PICKED_UP = 'PICKED_UP',
  TRANSFER_DISPATCHED = 'TRANSFER_DISPATCHED',
  TRANSFER_RECEIVED = 'TRANSFER_RECEIVED',
  NOTE = 'NOTE',
  CANCELLED = 'CANCELLED',
}
