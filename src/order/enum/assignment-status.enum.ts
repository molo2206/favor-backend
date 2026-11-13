export enum AssignmentStatus {
    /** Affectation créée automatiquement par l'admin */
    ASSIGNED = 'ASSIGNED',

    /** Le livreur a récupéré le colis */
    PICKED_UP = 'PICKED_UP',

    /** Le livreur est en route vers le client */
    IN_TRANSIT = 'IN_TRANSIT',

    /** Livraison effectuée */
    DELIVERED = 'DELIVERED',

    /** Le livreur a refusé (cas exceptionnel) */
    REJECTED = 'REJECTED',

    /** Affectation annulée par l'admin */
    CANCELLED = 'CANCELLED',
}