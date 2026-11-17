/**
 * ✅ Statut d'une fiche de contrôle technique.
 *  Cycle : PENDING_PAYMENT → (paiement confirmé) → PAYMENT_CONFIRMED → IN_PROGRESS → VALIDATED | REJECTED
 *          et EXPIRED lorsque la date d'échéance est dépassée.
 */
export enum TechnicalControlStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT', // paiement en attente (contrôle non encore réalisable)
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED', // paiement confirmé → contrôle réalisable
  IN_PROGRESS = 'IN_PROGRESS', // contrôle en cours
  VALIDATED = 'VALIDATED', // contrôle validé
  REJECTED = 'REJECTED', // contrôle rejeté
  EXPIRED = 'EXPIRED', // contrôle expiré
}

/** ✅ Statut du paiement d'un contrôle technique (indépendant du paiement de la location). */
export enum TechnicalControlPaymentStatus {
  PENDING = 'PENDING', // paiement en attente
  CONFIRMED = 'CONFIRMED', // paiement confirmé (par le mécanisme de paiement, pas sur simple déclaration)
  FAILED = 'FAILED', // paiement échoué
  CANCELLED = 'CANCELLED', // paiement annulé
}
