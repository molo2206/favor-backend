/** État d'un colis dans le stock d'une branche */
export enum BranchStockStatus {
  IN_STOCK = 'IN_STOCK', // tout est en stock
  PARTIAL = 'PARTIAL', // une partie est déjà sortie
  OUT = 'OUT', // plus rien en stock
}

/** Type de mouvement (pointage) */
export enum BranchMovementType {
  IN_RECEPTION = 'IN_RECEPTION', // réception (approvisionnement de la branche)
  IN_TRANSFER = 'IN_TRANSFER', // arrivée d'un transfert inter-branches
  IN_ADJUSTMENT = 'IN_ADJUSTMENT', // correction d'inventaire (+)
  OUT_PICKUP = 'OUT_PICKUP', // retrait par le client
  OUT_TRANSFER = 'OUT_TRANSFER', // départ vers une autre branche
  OUT_MANUAL = 'OUT_MANUAL', // diminution manuelle (perte, casse, retour…)
  OUT_ADJUSTMENT = 'OUT_ADJUSTMENT', // correction d'inventaire (-)
}

export const MOVEMENTS_IN: BranchMovementType[] = [
  BranchMovementType.IN_RECEPTION,
  BranchMovementType.IN_TRANSFER,
  BranchMovementType.IN_ADJUSTMENT,
];
