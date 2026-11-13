/**
 * ✅ Catégorie de location d'un véhicule (CAR en RENTAL / BOTH).
 *  - PRIVATE      : location privée (particuliers) — comportement ACTUEL, inchangé.
 *  - ORGANIZATION : location pour organisations (ONG, entreprises, associations…).
 *  - BOTH         : à la fois privé ET organisation.
 *  Pour ORGANIZATION ou BOTH : prix journalier obligatoire, responsabilités réparties,
 *  contrôle technique requis pour la location organisation.
 */
export enum RentalCategory {
  PRIVATE = 'PRIVATE',
  ORGANIZATION = 'ORGANIZATION',
  BOTH = 'BOTH',
}
