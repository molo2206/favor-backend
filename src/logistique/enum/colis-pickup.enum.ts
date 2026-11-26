/**
 * ✅ Moment du paiement du RAMASSAGE d'un colis.
 *  - PAID_TO_SUPPLIER : déjà réglé au fournisseur (en amont) → rien à encaisser au ramassage ;
 *  - PAY_ON_PICKUP    : à régler au moment du ramassage (encaissé par le ramasseur).
 */
export enum ColisPickupPaymentTiming {
  PAID_TO_SUPPLIER = 'PAID_TO_SUPPLIER',
  PAY_ON_PICKUP = 'PAY_ON_PICKUP',
}

/** État du paiement du ramassage. */
export enum ColisPickupPaymentStatus {
  PENDING = 'PENDING', // à encaisser (ramassage à payer)
  PAID = 'PAID', // réglé (au fournisseur, ou encaissé au ramassage)
}

// ✅ Le mode de paiement du ramassage réutilise l'enum partagé du système
//    (mêmes modes que les commandes) : src/operation/enum/payment-method.enum
//    → CASH, MOBILE_MONEY, BANK, MANUAL, FPAY.
