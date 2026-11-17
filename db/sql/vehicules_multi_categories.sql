-- =====================================================================================
-- ✅ Courses : un chauffeur / véhicule peut appartenir à PLUSIEURS catégories
--    (ex. Confort + Familiale).
--    Base Favor Help — 1 NOUVELLE table, aucune table existante modifiée.
--    driver_vehicles.categoryId reste la catégorie principale.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS `driver_vehicle_categories` (
  `vehicleId`  varchar(36) NOT NULL,
  `categoryId` varchar(36) NOT NULL,
  `createdAt`  datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`vehicleId`, `categoryId`),
  KEY `idx_dvc_category` (`categoryId`, `vehicleId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Si la table existe déjà avec un autre interclassement (erreur « Illegal mix of collations ») :
ALTER TABLE `driver_vehicle_categories` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Reprise : la catégorie actuelle de chaque véhicule devient sa première catégorie
INSERT IGNORE INTO `driver_vehicle_categories` (`vehicleId`, `categoryId`, `createdAt`)
SELECT `id`, `categoryId`, NOW() FROM `driver_vehicles` WHERE `categoryId` IS NOT NULL;
