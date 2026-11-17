/**
 * ✅ Ramassage d'un shipment (mêmes valeurs que les colis).
 *  - PAID_TO_SUPPLIER : déjà réglé au fournisseur (en amont) ;
 *  - PAY_ON_PICKUP    : à régler pendant le ramassage.
 */
export enum ShipmentPickupPaymentTiming {
  PAID_TO_SUPPLIER = 'PAID_TO_SUPPLIER',
  PAY_ON_PICKUP = 'PAY_ON_PICKUP',
}

/** État du paiement du ramassage. */
export enum ShipmentPickupPaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
}
