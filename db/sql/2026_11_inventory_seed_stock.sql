-- =====================================================================
-- Reprise du stock existant (products.quantity) dans l'inventaire avancé (stock_items)
-- À exécuter UNE fois APRÈS 2026_11_inventory.sql.
-- ✅ Non destructif et RÉ-EXÉCUTABLE :
--    - un emplacement « Magasin » n'est créé que pour les entreprises qui n'en ont AUCUN ;
--    - seuls les produits SANS aucune ligne de stock sont repris (rien n'est écrasé) ;
--    - chaque reprise est tracée dans stock_movements (IN / INVENTORY, référence REPRISE-2026-11).
-- Les comparaisons entre anciennes et nouvelles tables forcent la collation (évite « Illegal mix of collations »).
-- Concerne SHOP, GROCERY et RESTAURANT.
-- ⚠️ PHARMACIE exclue : son stock se gère par LOT (numéro + péremption) → passer par des réceptions avec lot.
-- =====================================================================

-- 1) Emplacement de vente par défaut pour les entreprises concernées qui n'en ont aucun
INSERT INTO `stock_locations` (`id`, `companyId`, `branchId`, `name`, `type`, `isDefaultSale`, `isActive`)
SELECT UUID(), c.`id`, NULL, 'Magasin', 'SHELF', 1, 1
FROM `company` c
WHERE c.`typeCompany` IN ('SHOP', 'GROCERY', 'RESTAURANT')
  AND NOT EXISTS (SELECT 1 FROM `stock_locations` l WHERE l.`companyId` = c.`id` COLLATE utf8mb4_unicode_ci);

-- 2) Emplacement de reprise retenu pour chaque entreprise :
--    l'emplacement de vente par défaut actif, sinon le premier emplacement actif créé
DROP TEMPORARY TABLE IF EXISTS `tmp_seed_location`;
CREATE TEMPORARY TABLE `tmp_seed_location` (
  `companyId`  VARCHAR(36) NOT NULL,
  `locationId` VARCHAR(36) NOT NULL,
  PRIMARY KEY (`companyId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `tmp_seed_location` (`companyId`, `locationId`)
SELECT c.`id`,
  COALESCE(
    (SELECT l.`id` FROM `stock_locations` l
      WHERE l.`companyId` = c.`id` COLLATE utf8mb4_unicode_ci AND l.`isActive` = 1 AND l.`isDefaultSale` = 1
      ORDER BY l.`createdAt` ASC LIMIT 1),
    (SELECT l.`id` FROM `stock_locations` l
      WHERE l.`companyId` = c.`id` COLLATE utf8mb4_unicode_ci AND l.`isActive` = 1
      ORDER BY l.`createdAt` ASC LIMIT 1)
  )
FROM `company` c
WHERE c.`typeCompany` IN ('SHOP', 'GROCERY', 'RESTAURANT');

DELETE FROM `tmp_seed_location` WHERE `locationId` IS NULL;

-- 3) Produits à reprendre : quantité > 0 et AUCUNE ligne de stock existante
DROP TEMPORARY TABLE IF EXISTS `tmp_seed_stock`;
CREATE TEMPORARY TABLE `tmp_seed_stock` (
  `id`          VARCHAR(36)   NOT NULL,
  `companyId`   VARCHAR(36)   NOT NULL,
  `locationId`  VARCHAR(36)   NOT NULL,
  `productId`   VARCHAR(36)   NOT NULL,
  `quantity`    DECIMAL(14,3) NOT NULL,
  `minQuantity` DECIMAL(14,3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `tmp_seed_stock` (`id`, `companyId`, `locationId`, `productId`, `quantity`, `minQuantity`)
SELECT UUID(), p.`companyId`, sl.`locationId`, p.`id`, p.`quantity`, GREATEST(COALESCE(p.`min_quantity`, 0), 0)
FROM `products` p
INNER JOIN `tmp_seed_location` sl ON sl.`companyId` = p.`companyId` COLLATE utf8mb4_unicode_ci
WHERE p.`listingType` = 'PRODUCT'
  AND p.`quantity` > 0
  AND NOT EXISTS (SELECT 1 FROM `stock_items` si WHERE si.`productId` = p.`id` COLLATE utf8mb4_unicode_ci);

-- 4) Lignes de stock
INSERT INTO `stock_items` (`id`, `companyId`, `locationId`, `productId`, `quantity`, `reserved`, `minQuantity`)
SELECT `id`, `companyId`, `locationId`, `productId`, `quantity`, 0, `minQuantity`
FROM `tmp_seed_stock`;

-- 5) Traçabilité : un mouvement d'entrée par produit repris
INSERT INTO `stock_movements`
  (`id`, `companyId`, `locationId`, `productId`, `lotId`, `type`, `source`, `quantity`, `balanceAfter`, `reference`, `reason`, `performedById`)
SELECT UUID(), `companyId`, `locationId`, `productId`, NULL, 'IN', 'INVENTORY', `quantity`, `quantity`,
       'REPRISE-2026-11', 'Reprise du stock existant (products.quantity)', NULL
FROM `tmp_seed_stock`;

-- 6) Bilan
SELECT COUNT(*) AS `produits_repris`, COALESCE(SUM(`quantity`), 0) AS `quantite_totale` FROM `tmp_seed_stock`;

DROP TEMPORARY TABLE IF EXISTS `tmp_seed_stock`;
DROP TEMPORARY TABLE IF EXISTS `tmp_seed_location`;
