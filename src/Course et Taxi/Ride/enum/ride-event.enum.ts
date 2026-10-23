/** Étapes enregistrées dans l'historique d'une course (table ride_events) */
export enum RideEventType {
  CREATED = 'CREATED',
  DISPATCH_ROUND = 'DISPATCH_ROUND', // un lot de chauffeurs a reçu l'offre
  OFFER_REJECTED = 'OFFER_REJECTED', // un chauffeur a refusé
  ACCEPTED = 'ACCEPTED',
  DRIVER_ARRIVED = 'DRIVER_ARRIVED',
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  DRIVER_CANCELLED_REDISPATCH = 'DRIVER_CANCELLED_REDISPATCH', // le chauffeur annule → recherche d'un autre
  NO_DRIVER_FOUND = 'NO_DRIVER_FOUND',
  RATED = 'RATED',
  UPDATED = 'UPDATED',
}

/** Qui a annulé (même valeurs que la colonne rides.cancelledBy) */
export type RideActor = 'RIDER' | 'DRIVER' | 'SYSTEM';

/** Moyens de paiement d'une course */
export enum RidePaymentMethod {
  CASH = 'CASH',
  FPAY = 'FPAY',
  MOBILE_MONEY = 'MOBILE_MONEY',
  CARD = 'CARD',
}

/**
 * Événements Socket.IO des courses (WebSocket principal '/').
 * Les anciens événements ('notification', 'ride-accepted', 'ride-cancelled', 'accept-ride')
 * restent émis / acceptés pour les applications déjà publiées.
 */
export const RideSocketEvents = {
  // ---- client → serveur ----
  DRIVER_ONLINE: 'driver:online', // { lat, lng } : le chauffeur se met disponible
  DRIVER_OFFLINE: 'driver:offline',
  DRIVER_LOCATION: 'ride:driver-location', // { lat, lng, heading?, speed?, rideId? }
  OFFER_ACCEPT: 'ride:accept', // { rideId }
  OFFER_REJECT: 'ride:reject', // { rideId, reason? }
  ARRIVED: 'ride:arrived', // { rideId }
  START: 'ride:start', // { rideId }
  COMPLETE: 'ride:complete', // { rideId, distance?, duration? }
  CANCEL: 'ride:cancel', // { rideId, reason? }
  JOIN: 'ride:join', // { rideId } : suivre une course (passager / chauffeur)
  LEAVE: 'ride:leave',
  GET_STATE: 'ride:get-state',

  // ---- serveur → client ----
  STATE: 'ride:state', // course en cours (à la reconnexion)
  OFFER: 'ride:offer', // nouvelle offre pour un chauffeur
  OFFER_CANCELLED: 'ride:offer-cancelled', // offre plus disponible (prise / annulée / expirée)
  SEARCHING: 'ride:searching', // passager : recherche en cours
  ACCEPTED: 'ride:accepted',
  DRIVER_ARRIVED: 'ride:driver-arrived',
  STARTED: 'ride:started',
  COMPLETED: 'ride:completed',
  CANCELLED: 'ride:cancelled',
  NO_DRIVER: 'ride:no-driver',
  UPDATED: 'ride:updated',
  ERROR: 'ride:error',

  // ---- anciens noms (compatibilité) ----
  LEGACY_ACCEPT: 'accept-ride',
  LEGACY_ACCEPTED: 'ride-accepted',
  LEGACY_CANCELLED: 'ride-cancelled',
} as const;

export const rideRoom = (rideId: string) => `ride-${rideId}`;
export const DRIVERS_ROOM = 'drivers';
export const driversCategoryRoom = (categoryId: string) => `drivers-category-${categoryId}`;
