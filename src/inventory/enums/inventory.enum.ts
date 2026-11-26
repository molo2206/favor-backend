/** Type d'emplacement de stock */
export enum StockLocationType {
  WAREHOUSE = 'WAREHOUSE', // dépôt / réserve
  SHELF = 'SHELF', // rayon / point de vente
  COLD = 'COLD', // chambre froide (denrées, vaccins)
  OTHER = 'OTHER',
}

/** Sens / nature d'un mouvement de stock (journal) */
export enum StockMovementType {
  IN = 'IN', // réception / entrée
  OUT = 'OUT', // vente / sortie / consommation
  ADJUST = 'ADJUST', // ajustement d'inventaire (perte, casse, correction)
  TRANSFER_OUT = 'TRANSFER_OUT', // transfert sortant vers un autre emplacement
  TRANSFER_IN = 'TRANSFER_IN', // transfert entrant
  RETURN = 'RETURN', // retour client / fournisseur
}

/** Origine d'un mouvement */
export enum StockMovementSource {
  MANUAL = 'MANUAL', // saisie manuelle
  POS = 'POS', // vente en caisse
  ORDER = 'ORDER', // commande en ligne
  SYNC = 'SYNC', // synchronisation offline
  TRANSFER = 'TRANSFER',
  INVENTORY = 'INVENTORY', // inventaire tournant
}

/** Statut d'un lot (pharmacie / denrées) */
export enum StockLotStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  RECALLED = 'RECALLED', // rappel de lot
  DEPLETED = 'DEPLETED', // épuisé
}
