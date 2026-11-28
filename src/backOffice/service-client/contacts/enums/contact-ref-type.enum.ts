/**
 * Contexte d'un contact client par le service client.
 * Le client est TOUJOURS le propriétaire (du colis, de la commande, de la course…).
 * refId = identifiant de l'objet concerné (LTA, commande…) ; vide pour un contact GENERAL.
 */
export enum ContactRefType {
  LTA = 'LTA', // colis regroupés dans une LTA
  ORDER = 'ORDER', // commande
  RIDE = 'RIDE', // course / taxi
  TRIP = 'TRIP', // voyage
  VEHICLE_RESERVATION = 'VEHICLE_RESERVATION',
  HOTEL_RESERVATION = 'HOTEL_RESERVATION',
  GENERAL = 'GENERAL', // contact général (sans objet précis)
}
