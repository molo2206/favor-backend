/** Cycle de vie d'une annonce (type Jiji) */
export enum ClassifiedStatus {
  DRAFT = 'DRAFT', // brouillon : pas encore payée
  PENDING_PAYMENT = 'PENDING_PAYMENT', // paiement Mobile Money en attente de confirmation
  PENDING_REVIEW = 'PENDING_REVIEW', // payée, en attente de modération
  ACTIVE = 'ACTIVE', // en ligne
  REJECTED = 'REJECTED', // refusée par la modération
  EXPIRED = 'EXPIRED', // durée payée terminée
  SOLD = 'SOLD', // vendu / clôturée par l'annonceur
  CLOSED = 'CLOSED', // retirée par l'annonceur
}

export enum ClassifiedCondition {
  NEW = 'NEW',
  USED = 'USED',
  REFURBISHED = 'REFURBISHED',
  NOT_APPLICABLE = 'NOT_APPLICABLE', // services, immobilier, emplois…
}

export enum ClassifiedPaymentMethod {
  FPAY = 'FPAY',
  MOBILE_MONEY = 'MOBILE_MONEY',
  FREE = 'FREE', // forfait gratuit (prix 0)
  MANUAL = 'MANUAL', // validé par un administrateur (espèces, agence…)
}

export enum ClassifiedPaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum ClassifiedReportReason {
  SCAM = 'SCAM',
  PROHIBITED = 'PROHIBITED',
  WRONG_CATEGORY = 'WRONG_CATEGORY',
  DUPLICATE = 'DUPLICATE',
  SOLD = 'SOLD',
  OFFENSIVE = 'OFFENSIVE',
  OTHER = 'OTHER',
}

export enum ClassifiedReportStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

/** Statuts visibles par le public */
export const PUBLIC_STATUSES = [ClassifiedStatus.ACTIVE];

/** Statuts dans lesquels l'annonceur peut payer (publier ou renouveler) */
export const PAYABLE_STATUSES = [
  ClassifiedStatus.DRAFT,
  ClassifiedStatus.PENDING_PAYMENT,
  ClassifiedStatus.ACTIVE,
  ClassifiedStatus.EXPIRED,
];
