/** ✅ ÉTATS DE BESOINS — valeurs partagées */

/** Étape du circuit de validation */
export enum NeedStatus {
  DRAFT = 'DRAFT', // brouillon (modifiable par l'agent)
  PENDING = 'PENDING', // en cours de validation (un niveau à la fois)
  CORRECTION_REQUESTED = 'CORRECTION_REQUESTED', // renvoyé à l'agent pour correction / complément
  REJECTED = 'REJECTED', // rejeté (motif obligatoire)
  VALIDATED = 'VALIDATED', // tous les niveaux ont approuvé
  CANCELLED = 'CANCELLED', // annulé par l'agent ou l'administrateur
}

/** Suivi financier (distinct de la validation) */
export enum NeedFinanceStatus {
  NONE = 'NONE', // pas encore au service financier
  TRANSMITTED = 'TRANSMITTED', // transmis au service financier / à la caisse
  AUTHORIZED = 'AUTHORIZED', // décaissement autorisé (montant autorisé fixé)
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID', // montant autorisé entièrement décaissé
}

/** Exécution du besoin (distincte du paiement) */
export enum NeedExecutionStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  PARTIAL = 'PARTIAL', // partiellement exécuté
  COMPLETED = 'COMPLETED', // totalement exécuté
}

export enum NeedPriority {
  NORMAL = 'NORMAL',
  URGENT = 'URGENT',
  VERY_URGENT = 'VERY_URGENT',
}

/** Catégories proposées (texte libre accepté aussi : NEED_CATEGORIES n'est qu'une liste indicative) */
export const NEED_CATEGORIES = [
  'MATERIAL', // matériel
  'SUPPLIES', // fournitures
  'LOGISTICS',
  'TRANSPORT',
  'MAINTENANCE',
  'COMMUNICATION',
  'IT', // informatique
  'SERVICES',
  'TRAINING',
  'OTHER',
] as const;

/** État d'un niveau du circuit */
export enum NeedLevelStatus {
  WAITING = 'WAITING', // pas encore son tour
  CURRENT = 'CURRENT', // à valider maintenant
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED', // a demandé une correction
  SKIPPED = 'SKIPPED', // sans objet (seuil non atteint, aucun validateur, demandeur autorisé)
}

/** Rôles résolus dynamiquement dans un niveau */
export const NEED_APPROVER_ROLES = [
  'DEPARTMENT_MANAGER', // chef du département du demandeur (hr_departments.managerId)
  'PARENT_DEPARTMENT_MANAGER', // chef du département parent
  'FINANCE', // service financier (membres FINANCE + responsables trésorerie)
  'OWNER', // direction générale (propriétaires de l'entreprise)
  'NEED_ADMIN', // administrateurs du module
] as const;
export type NeedApproverRole = (typeof NEED_APPROVER_ROLES)[number];

/** Rôle dans le module (bo_need_members) */
export enum NeedMemberRole {
  ADMIN = 'ADMIN', // configuration du circuit, tout voir, intervenir hors tour
  FINANCE = 'FINANCE', // service financier / caisse : autorisation, paiement, exécution
  VIEWER = 'VIEWER', // lecture de toutes les demandes et des rapports
}

/** Actions de l'historique (non modifiable) */
export enum NeedAction {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  ITEMS_UPDATED = 'ITEMS_UPDATED',
  ATTACHMENT_ADDED = 'ATTACHMENT_ADDED',
  ATTACHMENT_REMOVED = 'ATTACHMENT_REMOVED',
  SUBMITTED = 'SUBMITTED',
  RESUBMITTED = 'RESUBMITTED',
  LEVEL_STARTED = 'LEVEL_STARTED',
  LEVEL_SKIPPED = 'LEVEL_SKIPPED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CORRECTION_REQUESTED = 'CORRECTION_REQUESTED',
  COMMENT = 'COMMENT',
  OVERRIDE = 'OVERRIDE', // décision d'un administrateur hors de son tour
  VALIDATED = 'VALIDATED',
  NOTIFIED = 'NOTIFIED',
  CALLED = 'CALLED',
  REMINDED = 'REMINDED',
  ESCALATED = 'ESCALATED',
  TRANSMITTED = 'TRANSMITTED',
  AUTHORIZED = 'AUTHORIZED',
  DISBURSED = 'DISBURSED',
  EXECUTION_UPDATED = 'EXECUTION_UPDATED',
  CANCELLED = 'CANCELLED',
}

/** Type de pièce jointe */
export const NEED_ATTACHMENT_KINDS = ['QUOTE', 'JUSTIFICATION', 'PAYMENT_PROOF', 'EXECUTION_PROOF', 'OTHER'] as const;
export type NeedAttachmentKind = (typeof NEED_ATTACHMENT_KINDS)[number];

export const NEED_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'FPAY', 'CARD', 'OTHER'] as const;

/** Étapes affichées dans la progression (Agent → validateurs → finance → paiement → exécution) */
export type NeedStepState = 'DONE' | 'CURRENT' | 'WAITING' | 'REJECTED' | 'RETURNED' | 'SKIPPED';
