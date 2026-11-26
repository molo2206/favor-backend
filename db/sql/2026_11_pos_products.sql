-- =====================================================================
-- Autoriser la création/modification de produits HORS-LIGNE (PRODUCT_MANAGE).
-- À exécuter SEULEMENT si tu as déjà lancé 2026_11_inventory.sql auparavant
-- (met à jour les lignes de capacités déjà créées pour y ajouter PRODUCT_MANAGE).
-- Les produits utilisent la table `products` existante : aucune nouvelle table.
-- Ré-exécutable sans risque.
-- =====================================================================

UPDATE `type_company_config`
  SET `offlineAllowedOps` = JSON_ARRAY('SALE','STOCK_OUT','STOCK_IN','PRICE_LOOKUP','PRODUCT_MANAGE')
  WHERE `companyType` IN ('SHOP','GROCERY');

UPDATE `type_company_config`
  SET `offlineAllowedOps` = JSON_ARRAY('SALE','STOCK_OUT','PRICE_LOOKUP','PRODUCT_MANAGE')
  WHERE `companyType` IN ('RESTAURANT','PHARMACIE');
