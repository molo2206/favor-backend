export enum CompanyType {
  RESTAURANT = 'RESTAURANT',
  CAR = 'CAR',
  GROCERY = 'GROCERY',
  SHOP = 'SHOP',
  SERVICE = 'SERVICE',
  HOTEL = 'HOTEL',
  SHIPPING = 'SHIPPING',
  AGENCE = 'AGENCE',
  LOGISTIC_AGENCY = 'LOGISTIC_AGENCY',
  TRANSPORT_AGENCY = 'TRANSPORT_AGENCY',
  TAXI = 'TAXI',
  // ✅ Nouveau : pharmacie (gestion par lots, péremption FEFO, ordonnance…)
  PHARMACIE = 'PHARMACIE',
  SYSTEM = 'SYSTEM',
  // ✅ Nouveau : atelier de couture (fabrication SUR COMMANDE / sur-mesure, prix par taille, commission plateforme)
  ATELIER_COUTURE = 'ATELIER_COUTURE',
}
