// ============================================================
// CHARROI (parc de véhicules)
// ============================================================
export enum FleetVehicleType {
  CAR = 'CAR',
  PICKUP = 'PICKUP',
  VAN = 'VAN',
  TRUCK = 'TRUCK',
  MOTORBIKE = 'MOTORBIKE',
  BUS = 'BUS',
  OTHER = 'OTHER',
}

export enum FleetFuelType {
  PETROL = 'PETROL',
  DIESEL = 'DIESEL',
  ELECTRIC = 'ELECTRIC',
  HYBRID = 'HYBRID',
  OTHER = 'OTHER',
}

export enum FleetVehicleStatus {
  AVAILABLE = 'AVAILABLE', // disponible
  IN_MISSION = 'IN_MISSION', // en mission
  MAINTENANCE = 'MAINTENANCE', // au garage
  OUT_OF_SERVICE = 'OUT_OF_SERVICE', // en panne / immobilisé
  RETIRED = 'RETIRED', // sorti du parc
}

export enum FleetMissionType {
  DELIVERY = 'DELIVERY',
  PICKUP = 'PICKUP',
  TRANSFER = 'TRANSFER', // déplacement de matériel / de personnel entre sites
  ADMINISTRATIVE = 'ADMINISTRATIVE',
  OTHER = 'OTHER',
}

export enum FleetMissionStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum FleetMaintenanceType {
  PREVENTIVE = 'PREVENTIVE', // vidange, révision
  CORRECTIVE = 'CORRECTIVE', // réparation
  BREAKDOWN = 'BREAKDOWN', // panne
  INSPECTION = 'INSPECTION',
  TIRES = 'TIRES',
  OTHER = 'OTHER',
}

export enum FleetMaintenanceStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum FleetDocumentType {
  INSURANCE = 'INSURANCE', // assurance
  TECHNICAL_INSPECTION = 'TECHNICAL_INSPECTION', // contrôle technique
  REGISTRATION = 'REGISTRATION', // carte grise
  ROAD_TAX = 'ROAD_TAX', // vignette
  PARKING_PERMIT = 'PARKING_PERMIT',
  OTHER = 'OTHER',
}

// ============================================================
// LOGISTIQUE INTERNE : BIENS DE L'ENTREPRISE (patrimoine)
// ============================================================
/** Situation d'un bien */
export enum AssetStatus {
  AVAILABLE = 'AVAILABLE', // en stock / disponible
  IN_USE = 'IN_USE', // affecté à un employé
  IN_REPAIR = 'IN_REPAIR', // en réparation
  LOST = 'LOST', // perdu / volé
  DISPOSED = 'DISPOSED', // sorti du patrimoine (vendu, donné, détruit)
}

/** État physique d'un bien */
export enum AssetCondition {
  NEW = 'NEW',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  DAMAGED = 'DAMAGED',
}

/** Mouvements enregistrés dans l'historique d'un bien */
export enum AssetMovementType {
  ACQUIRED = 'ACQUIRED', // entrée dans le patrimoine
  ASSIGNED = 'ASSIGNED', // remis à un employé
  RETURNED = 'RETURNED', // rendu par l'employé
  TRANSFERRED = 'TRANSFERRED', // changement de branche / d'emplacement
  REPAIR_SENT = 'REPAIR_SENT',
  REPAIR_RETURNED = 'REPAIR_RETURNED',
  CONDITION_CHANGED = 'CONDITION_CHANGED',
  INVENTORY_CHECK = 'INVENTORY_CHECK', // contrôle d'inventaire
  LOST = 'LOST',
  FOUND = 'FOUND',
  DISPOSED = 'DISPOSED',
  UPDATED = 'UPDATED',
}

/** Motif de sortie du patrimoine */
export enum AssetDisposalReason {
  SOLD = 'SOLD',
  DONATED = 'DONATED',
  SCRAPPED = 'SCRAPPED', // détruit / mis au rebut
  STOLEN = 'STOLEN',
  OTHER = 'OTHER',
}
