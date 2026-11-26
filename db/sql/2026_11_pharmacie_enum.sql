-- =====================================================================
-- Ajout du type d'entreprise PHARMACIE aux colonnes ENUM existantes.
-- À exécuter AVANT de créer une entreprise de type PHARMACIE.
-- Sûr : ajouter une valeur à un ENUM ne modifie aucune ligne existante.
-- =====================================================================

ALTER TABLE `company`
  MODIFY COLUMN `typeCompany`
  ENUM('RESTAURANT','CAR','GROCERY','SHOP','SERVICE','HOTEL','SHIPPING','AGENCE','LOGISTIC_AGENCY','TRANSPORT_AGENCY','TAXI','PHARMACIE') NOT NULL;

ALTER TABLE `orders`
  MODIFY COLUMN `type`
  ENUM('RESTAURANT','CAR','GROCERY','SHOP','SERVICE','HOTEL','SHIPPING','AGENCE','LOGISTIC_AGENCY','TRANSPORT_AGENCY','TAXI','PHARMACIE') NOT NULL;

ALTER TABLE `company_tariffs`
  MODIFY COLUMN `company_type`
  ENUM('RESTAURANT','CAR','GROCERY','SHOP','SERVICE','HOTEL','SHIPPING','AGENCE','LOGISTIC_AGENCY','TRANSPORT_AGENCY','TAXI','PHARMACIE') NULL;
