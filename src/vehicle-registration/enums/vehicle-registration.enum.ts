/** Type d'enregistrement : véhicule à vendre ou à louer */
export enum VehicleRegistrationType {
  SALE = 'SALE',
  RENTAL = 'RENTAL',
}

/** État du moteur */
export enum VehicleEngineCondition {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  AVERAGE = 'AVERAGE',
  NEEDS_REPAIR = 'NEEDS_REPAIR',
  NOT_WORKING = 'NOT_WORKING',
}

/** Originalité du véhicule : modifié, accidenté ou pas */
export enum VehicleOriginality {
  ORIGINAL = 'ORIGINAL', // ni modifié ni accidenté
  MODIFIED = 'MODIFIED', // modifié
  ACCIDENTED = 'ACCIDENTED', // accidenté
  MODIFIED_AND_ACCIDENTED = 'MODIFIED_AND_ACCIDENTED', // modifié et accidenté
}

/** Situation du véhicule */
export enum VehicleRegistrationStatus {
  AVAILABLE = 'AVAILABLE', // disponible
  RESERVED = 'RESERVED', // réservé
  SOLD = 'SOLD', // vendu
  RENTED = 'RENTED', // loué
  WITHDRAWN = 'WITHDRAWN', // retiré par le propriétaire
}

/**
 * Documents disponibles : valeurs proposées au front.
 * D'autres libellés restent acceptés (texte libre).
 */
export const VEHICLE_DOCUMENTS = [
  'CARTE_GRISE',
  'ASSURANCE',
  'CONTROLE_TECHNIQUE',
  'VIGNETTE',
  'DEDOUANEMENT',
  'FACTURE_ACHAT',
  'PLAQUE',
  'AUTRE',
] as const;

/** Nombre maximum d'images par véhicule */
export const VEHICLE_MAX_IMAGES = 20;
