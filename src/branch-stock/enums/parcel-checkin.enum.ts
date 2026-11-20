/** Séance de pointage : à quel moment on pointe les colis */
export enum CheckinType {
  LTA_ARRIVAL = 'LTA_ARRIVAL', // arrivée d'une LTA dans un dépôt (n'importe quelle branche)
  TRANSFER_RECEPTION = 'TRANSFER_RECEPTION', // réception d'un transfert dans la branche de destination
}

export enum CheckinStatus {
  OPEN = 'OPEN', // pointage en cours (scans possibles)
  CLOSED = 'CLOSED', // clôturé : le stock de la branche est mis à jour
  CANCELLED = 'CANCELLED', // annulé : aucun effet sur le stock
}

/** État d'un colis dans une séance de pointage */
export enum CheckinItemStatus {
  PENDING = 'PENDING', // attendu, pas encore pointé
  PARTIAL = 'PARTIAL', // une partie des pièces pointée
  CHECKED = 'CHECKED', // toutes les pièces pointées
  MISSING = 'MISSING', // attendu mais jamais pointé (à la clôture)
  UNEXPECTED = 'UNEXPECTED', // colis connu mais pas prévu dans ce pointage
  UNKNOWN = 'UNKNOWN', // code scanné introuvable
  ALREADY_RECEIVED = 'ALREADY_RECEIVED', // colis de la LTA déjà réceptionné auparavant (non compté)
}

/** Transfert de colis d'une branche vers une autre */
export enum TransferStatus {
  IN_TRANSIT = 'IN_TRANSIT', // envoyé, pas encore réceptionné
  RECEIVED = 'RECEIVED', // tout est arrivé
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED', // réceptionné avec des manquants
  CLOSED = 'CLOSED', // manquants remis en stock au départ : transfert soldé
  CANCELLED = 'CANCELLED', // annulé avant réception : stock remis au départ
}

export enum TransferItemStatus {
  IN_TRANSIT = 'IN_TRANSIT',
  RECEIVED = 'RECEIVED',
  PARTIAL = 'PARTIAL',
  MISSING = 'MISSING',
  RETURNED = 'RETURNED', // manquant remis en stock à la branche de départ
  CANCELLED = 'CANCELLED',
}

/** Statuts de transfert qui acceptent encore une réception */
export const TRANSFER_RECEIVABLE: TransferStatus[] = [TransferStatus.IN_TRANSIT, TransferStatus.PARTIALLY_RECEIVED];
