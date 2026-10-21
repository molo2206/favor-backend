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
  TRANSFER = 'TRANSFER', // transfert inter-branches (logistique interne)
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
// LOGISTIQUE INTERNE (transferts de colis entre branches)
// ============================================================
export enum InternalTransferStatus {
  DRAFT = 'DRAFT', // en préparation
  IN_TRANSIT = 'IN_TRANSIT', // parti de la branche d'origine
  RECEIVED = 'RECEIVED', // tout reçu
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED', // reçu avec des pièces manquantes
  CANCELLED = 'CANCELLED',
}
