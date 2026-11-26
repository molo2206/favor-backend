export enum PosSessionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum PosSaleStatus {
  PAID = 'PAID',
  VOID = 'VOID', // annulée
}

/** État de règlement d'une vente (indépendant du statut PAID/VOID) */
export enum PosPaymentStatus {
  PAID = 'PAID', // soldée
  PARTIAL = 'PARTIAL', // acompte versé, reste dû
  CREDIT = 'CREDIT', // à crédit (rien versé, client identifié)
  UNPAID = 'UNPAID', // non réglée
}

export enum PosPaymentMethod {
  CASH = 'CASH',
  FPAY = 'FPAY',
  MOBILE_MONEY = 'MOBILE_MONEY',
  CARD = 'CARD',
  OTHER = 'OTHER',
}

/** Origine d'une vente : saisie en ligne ou remontée depuis une caisse hors-ligne */
export enum PosSaleSource {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}
