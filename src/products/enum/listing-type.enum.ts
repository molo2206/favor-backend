/** Nature d'une ligne de la table `products` */
export enum ListingType {
  /** Produit d'une entreprise (fonctionnement existant) */
  PRODUCT = 'PRODUCT',
  /** Annonce d'un particulier ou de n'importe quel utilisateur (type Jiji), sans entreprise */
  CLASSIFIED = 'CLASSIFIED',
}
