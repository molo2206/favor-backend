-- =====================================================================================
-- ✅ Courses + Supply (base favor_db : sélectionner favor_db dans phpMyAdmin avant d'exécuter)
--    1) places du véhicule (driver_vehicles.seats) et passagers de la course (rides.passengers)
--    2) itinéraire modifiable + prolongation de la course (historique complet)
--    3) Supply : plusieurs colis par commande, articles pointés par colis
--    Sans accès à information_schema. Aucune donnée supprimée.
--
--    ⚠️ PARTIE A : une ligne par colonne. « #1060 Duplicate column name » = colonne déjà là :
--       retirer cette ligne et relancer les suivantes.
--    PARTIE B : ré-exécutable sans risque.
--    Migration équivalente : db/migrations/1795046400000-RideRouteSeatsSupplyItems.ts
-- =====================================================================================

-- ---------- PARTIE A : colonnes ----------
ALTER TABLE `driver_vehicles` ADD COLUMN `seats` INT NULL DEFAULT NULL;
ALTER TABLE `rides` ADD COLUMN `passengers` INT NOT NULL DEFAULT 1;
ALTER TABLE `rides` ADD COLUMN `originalDropoffLocation` JSON NULL;
ALTER TABLE `rides` ADD COLUMN `originalPrice` DECIMAL(10,2) NULL;
ALTER TABLE `rides` ADD COLUMN `extraPrice` DECIMAL(10,2) NULL;
ALTER TABLE `rides` ADD COLUMN `waypoints` JSON NULL;
ALTER TABLE `rides` ADD COLUMN `stops` JSON NULL;
ALTER TABLE `rides` ADD COLUMN `routeChangesCount` INT NOT NULL DEFAULT 0;
ALTER TABLE `rides` ADD COLUMN `routeHistory` JSON NULL;

-- ---------- PARTIE B : reprise + table des colis ----------
UPDATE `rides` SET `originalDropoffLocation` = `dropoffLocation` WHERE `originalDropoffLocation` IS NULL;
UPDATE `rides` SET `originalPrice` = `price` WHERE `originalPrice` IS NULL AND `price` IS NOT NULL;

CREATE TABLE IF NOT EXISTS `supply_shipment_items` (
  `id`             varchar(36)   NOT NULL,
  `supplyId`       varchar(36)   NOT NULL,
  `shipmentId`     varchar(36)   NOT NULL,
  `orderItemId`    varchar(36)   NOT NULL COMMENT 'order_items.id ou sub_order_items.id',
  `itemSource`     varchar(20)   NOT NULL DEFAULT 'ORDER_ITEM' COMMENT 'ORDER_ITEM | SUB_ORDER_ITEM',
  `productId`      varchar(36)   NULL,
  `productName`    varchar(255)  NULL,
  `variationLabel` varchar(500)  NULL,
  `sku`            varchar(255)  NULL,
  `quantity`       int           NOT NULL,
  `unitPrice`      decimal(12,2) NULL,
  `checkedById`    varchar(36)   NULL,
  `checkedAt`      datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_ssi_supply` (`supplyId`),
  KEY `idx_ssi_shipment` (`shipmentId`),
  KEY `idx_ssi_item` (`orderItemId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vérification : 8 colonnes attendues
SHOW COLUMNS FROM `rides`
WHERE Field IN ('passengers','originalDropoffLocation','originalPrice','extraPrice','waypoints','stops','routeChangesCount','routeHistory');
SHOW COLUMNS FROM `driver_vehicles` LIKE 'seats';
SHOW TABLES LIKE 'supply_shipment_items';
