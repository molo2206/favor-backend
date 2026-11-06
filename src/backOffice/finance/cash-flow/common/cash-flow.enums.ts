/** ✅ Type de compte de trésorerie */
export enum CashAccountType {
  CASH = 'CASH', // caisse (espèces)
  BANK = 'BANK', // compte bancaire
  MOBILE_MONEY = 'MOBILE_MONEY', // M-Pesa, Airtel Money, Orange Money…
  FPAY = 'FPAY', // portefeuille F-Pay
  OTHER = 'OTHER',
}

/** Sens d'un mouvement */
export enum CashDirection {
  IN = 'IN', // entrée (encaissement)
  OUT = 'OUT', // sortie (décaissement)
}

/** Rubrique du tableau des flux de trésorerie */
export enum CashActivity {
  OPERATING = 'OPERATING', // exploitation (ventes, salaires, loyer…)
  INVESTING = 'INVESTING', // investissement (équipements, véhicules…)
  FINANCING = 'FINANCING', // financement (apports, emprunts, remboursements)
}

/** État d'un mouvement */
export enum CashTransactionStatus {
  PENDING = 'PENDING', // à valider par un responsable financier
  VALIDATED = 'VALIDATED', // compté dans le solde
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED', // annulé après validation (plus compté)
}

/** Rôle dans la trésorerie de l'entreprise */
export enum FinanceRole {
  MANAGER = 'MANAGER', // responsable financier : tout (comptes, rubriques, validation, prévisions)
  CASHIER = 'CASHIER', // caissier : saisit entrées / sorties, transferts, arrêtés de caisse
  VIEWER = 'VIEWER', // lecture seule (rapports)
}

export const FINANCE_ROLE_RANK: Record<FinanceRole, number> = {
  [FinanceRole.VIEWER]: 1,
  [FinanceRole.CASHIER]: 2,
  [FinanceRole.MANAGER]: 3,
};

/** Mode de paiement d'un mouvement */
export const CASH_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'FPAY', 'CARD', 'OTHER'] as const;
export type CashPaymentMethod = (typeof CASH_PAYMENT_METHODS)[number];

/** Codes des rubriques système (créées automatiquement) */
export const SYSTEM_CATEGORY = {
  CASH_GAIN: 'SYS_CASH_GAIN', // écart de caisse positif
  CASH_LOSS: 'SYS_CASH_LOSS', // écart de caisse négatif
  TRANSFER_FEES: 'SYS_TRANSFER_FEES', // frais de transfert
} as const;

// ============================================================
// ✅ CIRCUIT DE VALIDATION (niveaux d'approbation)
// ============================================================

/** Opérations concernées par une règle de validation */
export enum CashApprovalScope {
  OUT = 'OUT', // sorties (décaissements)
  IN = 'IN', // entrées (encaissements)
  TRANSFER = 'TRANSFER', // transferts entre comptes
  ALL = 'ALL',
}

/** Objet soumis à validation */
export enum CashApprovalTarget {
  TRANSACTION = 'TRANSACTION',
  TRANSFER = 'TRANSFER',
}

/** État d'une demande de validation */
export enum CashApprovalStatus {
  PENDING = 'PENDING', // en cours (un niveau attend une décision)
  APPROVED = 'APPROVED', // tous les niveaux ont validé → mouvement validé
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED', // retirée par le demandeur / annulée
}

/** État d'un niveau dans une demande */
export enum CashApprovalLevelStatus {
  WAITING = 'WAITING', // pas encore atteint
  PENDING = 'PENDING', // en attente de décision (les validateurs sont appelés)
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SKIPPED = 'SKIPPED', // validé d'office (le demandeur a l'autorité de ce niveau)
}

/** Rôles dynamiques pouvant valider un niveau */
export const CASH_APPROVER_ROLES = ['OWNER', 'MANAGER'] as const;
export type CashApproverRole = (typeof CASH_APPROVER_ROLES)[number];

/** Historique d'une demande */
export enum CashApprovalAction {
  SUBMITTED = 'SUBMITTED',
  LEVEL_STARTED = 'LEVEL_STARTED',
  CALLED = 'CALLED', // appel (sonnerie) envoyé aux validateurs
  SEEN = 'SEEN', // un validateur a ouvert la demande (sonnerie arrêtée)
  REMINDED = 'REMINDED', // relance automatique ou manuelle
  ESCALATED = 'ESCALATED', // pas de réponse : responsables supérieurs prévenus
  APPROVED = 'APPROVED',
  AUTO_APPROVED = 'AUTO_APPROVED',
  REJECTED = 'REJECTED',
  FORCED = 'FORCED', // validation forcée (propriétaire / admin)
  COMMENT = 'COMMENT',
  RESTARTED = 'RESTARTED', // montant modifié : circuit recommencé
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}
