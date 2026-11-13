/**
 * ✅ Cycle de vie d'une réservation de véhicule pour ORGANISATION.
 *  Le paiement intervient APRÈS la prestation : une réservation n'est payable
 *  qu'une fois COMPLETED (prestation terminée).
 */
export enum OrganizationRentalStatus {
  PENDING = 'PENDING', // réservation créée, non confirmée
  CONFIRMED = 'CONFIRMED', // réservation confirmée (véhicule attribué)
  IN_PROGRESS = 'IN_PROGRESS', // prestation en cours
  COMPLETED = 'COMPLETED', // prestation terminée → payable
  PAID = 'PAID', // réglée après prestation
  CANCELLED = 'CANCELLED', // annulée
}

/** Modes de paiement acceptés (alignés sur classified-payment + espèces). */
export enum OrganizationRentalPaymentMethod {
  FPAY = 'FPAY',
  MOBILE_MONEY = 'MOBILE_MONEY',
  CASH = 'CASH', // espèces
}

/** Statut d'un paiement (confirmé par le mécanisme de paiement, pas sur déclaration — sauf espèces admin). */
export enum OrganizationRentalPaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}
