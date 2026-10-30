export enum ColisStatus {
  PENDING = 'PENDING', // créé par le client
  PRICED = 'PRICED', // prix défini par admin
  ASSIGNED = 'ASSIGNED', // livreur assigné
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}
