/**
 * ✅ Catégorie de location d'un véhicule (CAR en RENTAL / BOTH).
 *  - PRIVATE      : location privée (particuliers) — comportement ACTUEL, inchangé.
 *  - ORGANIZATION : location pour organisations (ONG, entreprises, associations…),
 *                   paiement après prestation, responsabilités réparties, contrôle technique requis.
 */
export enum RentalCategory {
  PRIVATE = 'PRIVATE',
  ORGANIZATION = 'ORGANIZATION',
}
