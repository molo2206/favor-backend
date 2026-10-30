-- =====================================================================
-- BackOffice — ADAPTATION DE LA LOGISTIQUE INTERNE
--   Avant : transferts de colis entre branches (bo_logistics_transfers / _items)
--   Après : biens de l'entreprise (bo_asset_categories, bo_assets, bo_asset_movements)
--           + charroi inchangé (bo_fleet_*), sans lien avec les colis.
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ✅ Base détectée automatiquement (celle qui contient `company`),
--    même si « information_schema » est sélectionnée dans phpMyAdmin.
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'company'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';
SELECT @db AS base_modifiee;

SET @coll = COALESCE((SELECT TABLE_COLLATION FROM information_schema.TABLES
                       WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' LIMIT 1), 'utf8mb4_unicode_ci');
SET @cs = COALESCE((SELECT CHARACTER_SET_NAME FROM information_schema.COLLATIONS
                     WHERE COLLATION_NAME = @coll LIMIT 1), 'utf8mb4');
SET @OLD_FK = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1) Suppression des anciens transferts de colis (plus utilisés par le code)
--    Mettez @force_drop = 1 pour les supprimer même s'ils contiennent des lignes.
-- ---------------------------------------------------------------------
SET @force_drop = 0;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_logistics_transfer_items') = 1 AND (@force_drop = 1 OR COALESCE((SELECT TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_logistics_transfer_items'), 0) = 0),
  CONCAT('DROP TABLE `', @db, '`.`bo_logistics_transfer_items`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_logistics_transfers') = 1 AND (@force_drop = 1 OR COALESCE((SELECT TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_logistics_transfers'), 0) = 0),
  CONCAT('DROP TABLE `', @db, '`.`bo_logistics_transfers`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Missions du charroi : la colonne transferId (lien avec les transferts de colis) est retirée
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_missions' AND COLUMN_NAME = 'transferId') = 1,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_missions` DROP COLUMN `transferId`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 2) Charroi : véhicules
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_fleet_vehicles` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `branchId` varchar(36) NULL DEFAULT NULL,
  `plateNumber` varchar(30) NOT NULL,
  `brand` varchar(80) NOT NULL,
  `model` varchar(80) NULL DEFAULT NULL,
  `year` int NULL DEFAULT NULL,
  `type` enum(''CAR'',''PICKUP'',''VAN'',''TRUCK'',''MOTORBIKE'',''BUS'',''OTHER'') NOT NULL DEFAULT ''CAR'',
  `fuelType` enum(''PETROL'',''DIESEL'',''ELECTRIC'',''HYBRID'',''OTHER'') NOT NULL DEFAULT ''DIESEL'',
  `color` varchar(40) NULL DEFAULT NULL,
  `vin` varchar(50) NULL DEFAULT NULL,
  `seats` int NULL DEFAULT NULL,
  `capacityKg` decimal(10,2) NULL DEFAULT NULL,
  `mileage` int NOT NULL DEFAULT 0,
  `status` enum(''AVAILABLE'',''IN_MISSION'',''MAINTENANCE'',''OUT_OF_SERVICE'',''RETIRED'') NOT NULL DEFAULT ''AVAILABLE'',
  `assignedDriverId` varchar(36) NULL DEFAULT NULL,
  `acquisitionDate` date NULL DEFAULT NULL,
  `acquisitionCost` decimal(14,2) NULL DEFAULT NULL,
  `photoUrl` varchar(500) NULL DEFAULT NULL,
  `notes` text NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND INDEX_NAME = 'uq_fleet_vehicle_plate') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` ADD UNIQUE INDEX `uq_fleet_vehicle_plate` (`companyId`,`plateNumber`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND INDEX_NAME = 'idx_fleet_vehicle_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` ADD INDEX `idx_fleet_vehicle_status` (`companyId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 3) Charroi : missions
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_fleet_missions` (',
  '
  `id` varchar(36) NOT NULL,
  `reference` varchar(30) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `vehicleId` varchar(36) NOT NULL,
  `driverId` varchar(36) NULL DEFAULT NULL,
  `type` enum(''DELIVERY'',''PICKUP'',''TRANSFER'',''ADMINISTRATIVE'',''OTHER'') NOT NULL DEFAULT ''OTHER'',
  `purpose` varchar(255) NOT NULL,
  `origin` varchar(255) NULL DEFAULT NULL,
  `destination` varchar(255) NULL DEFAULT NULL,
  `plannedStartAt` datetime(6) NULL DEFAULT NULL,
  `plannedEndAt` datetime(6) NULL DEFAULT NULL,
  `startedAt` datetime(6) NULL DEFAULT NULL,
  `endedAt` datetime(6) NULL DEFAULT NULL,
  `startMileage` int NULL DEFAULT NULL,
  `endMileage` int NULL DEFAULT NULL,
  `distanceKm` int NULL DEFAULT NULL,
  `status` enum(''PLANNED'',''IN_PROGRESS'',''COMPLETED'',''CANCELLED'') NOT NULL DEFAULT ''PLANNED'',
  `notes` text NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_missions' AND INDEX_NAME = 'uq_fleet_mission_reference') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_missions` ADD UNIQUE INDEX `uq_fleet_mission_reference` (`reference`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_missions' AND INDEX_NAME = 'idx_fleet_mission_vehicle') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_missions` ADD INDEX `idx_fleet_mission_vehicle` (`vehicleId`,`createdAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_missions' AND INDEX_NAME = 'idx_fleet_mission_company_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_missions` ADD INDEX `idx_fleet_mission_company_status` (`companyId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 4) Charroi : carburant
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_fleet_fuel_logs` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `vehicleId` varchar(36) NOT NULL,
  `driverId` varchar(36) NULL DEFAULT NULL,
  `missionId` varchar(36) NULL DEFAULT NULL,
  `filledAt` datetime(6) NOT NULL,
  `liters` decimal(10,2) NOT NULL,
  `unitPrice` decimal(10,2) NOT NULL,
  `totalCost` decimal(12,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT ''USD'',
  `mileage` int NULL DEFAULT NULL,
  `station` varchar(150) NULL DEFAULT NULL,
  `fullTank` tinyint NOT NULL DEFAULT 1,
  `receiptUrl` varchar(500) NULL DEFAULT NULL,
  `notes` text NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_fuel_logs' AND INDEX_NAME = 'idx_fleet_fuel_vehicle_date') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_fuel_logs` ADD INDEX `idx_fleet_fuel_vehicle_date` (`vehicleId`,`filledAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_fuel_logs' AND INDEX_NAME = 'idx_fleet_fuel_company_date') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_fuel_logs` ADD INDEX `idx_fleet_fuel_company_date` (`companyId`,`filledAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 5) Charroi : entretien / pannes
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_fleet_maintenances` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `vehicleId` varchar(36) NOT NULL,
  `type` enum(''PREVENTIVE'',''CORRECTIVE'',''BREAKDOWN'',''INSPECTION'',''TIRES'',''OTHER'') NOT NULL DEFAULT ''PREVENTIVE'',
  `title` varchar(200) NOT NULL,
  `description` text NULL,
  `garage` varchar(150) NULL DEFAULT NULL,
  `scheduledAt` datetime(6) NULL DEFAULT NULL,
  `startedAt` datetime(6) NULL DEFAULT NULL,
  `completedAt` datetime(6) NULL DEFAULT NULL,
  `mileage` int NULL DEFAULT NULL,
  `cost` decimal(12,2) NULL DEFAULT NULL,
  `currency` varchar(10) NOT NULL DEFAULT ''USD'',
  `status` enum(''SCHEDULED'',''IN_PROGRESS'',''COMPLETED'',''CANCELLED'') NOT NULL DEFAULT ''SCHEDULED'',
  `nextDueDate` date NULL DEFAULT NULL,
  `nextDueMileage` int NULL DEFAULT NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_maintenances' AND INDEX_NAME = 'idx_fleet_maint_vehicle') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_maintenances` ADD INDEX `idx_fleet_maint_vehicle` (`vehicleId`,`createdAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_maintenances' AND INDEX_NAME = 'idx_fleet_maint_company_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_maintenances` ADD INDEX `idx_fleet_maint_company_status` (`companyId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 6) Charroi : documents
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_fleet_documents` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `vehicleId` varchar(36) NOT NULL,
  `type` enum(''INSURANCE'',''TECHNICAL_INSPECTION'',''REGISTRATION'',''ROAD_TAX'',''PARKING_PERMIT'',''OTHER'') NOT NULL,
  `number` varchar(100) NULL DEFAULT NULL,
  `issuer` varchar(150) NULL DEFAULT NULL,
  `issueDate` date NULL DEFAULT NULL,
  `expiryDate` date NULL DEFAULT NULL,
  `cost` decimal(12,2) NULL DEFAULT NULL,
  `fileUrl` varchar(500) NULL DEFAULT NULL,
  `notes` text NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_documents' AND INDEX_NAME = 'idx_fleet_doc_expiry') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_documents` ADD INDEX `idx_fleet_doc_expiry` (`companyId`,`expiryDate`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_documents' AND INDEX_NAME = 'idx_fleet_doc_vehicle') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_documents` ADD INDEX `idx_fleet_doc_vehicle` (`vehicleId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 7) Logistique interne : catégories de biens
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_asset_categories` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `name` varchar(120) NOT NULL,
  `code` varchar(10) NULL DEFAULT NULL,
  `description` varchar(500) NULL DEFAULT NULL,
  `depreciationYears` int NULL DEFAULT NULL,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories' AND INDEX_NAME = 'uq_bo_asset_category_name') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_asset_categories` ADD UNIQUE INDEX `uq_bo_asset_category_name` (`companyId`,`name`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories' AND INDEX_NAME = 'idx_bo_asset_category_company') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_asset_categories` ADD INDEX `idx_bo_asset_category_company` (`companyId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 8) Logistique interne : biens de l'entreprise
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_assets` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `reference` varchar(40) NOT NULL,
  `name` varchar(150) NOT NULL,
  `categoryId` varchar(36) NULL DEFAULT NULL,
  `description` text NULL,
  `brand` varchar(80) NULL DEFAULT NULL,
  `model` varchar(80) NULL DEFAULT NULL,
  `serialNumber` varchar(100) NULL DEFAULT NULL,
  `barcode` varchar(100) NULL DEFAULT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `status` enum(''AVAILABLE'',''IN_USE'',''IN_REPAIR'',''LOST'',''DISPOSED'') NOT NULL DEFAULT ''AVAILABLE'',
  `condition` enum(''NEW'',''GOOD'',''FAIR'',''POOR'',''DAMAGED'') NOT NULL DEFAULT ''GOOD'',
  `branchId` varchar(36) NULL DEFAULT NULL,
  `location` varchar(150) NULL DEFAULT NULL,
  `assignedToUserId` varchar(36) NULL DEFAULT NULL,
  `assignedAt` datetime(6) NULL DEFAULT NULL,
  `acquisitionDate` date NULL DEFAULT NULL,
  `acquisitionCost` decimal(14,2) NULL DEFAULT NULL,
  `currency` varchar(10) NOT NULL DEFAULT ''USD'',
  `supplier` varchar(150) NULL DEFAULT NULL,
  `invoiceNumber` varchar(100) NULL DEFAULT NULL,
  `warrantyEndDate` date NULL DEFAULT NULL,
  `depreciationYears` int NULL DEFAULT NULL,
  `disposalReason` enum(''SOLD'',''DONATED'',''SCRAPPED'',''STOLEN'',''OTHER'') NULL DEFAULT NULL,
  `disposalDate` date NULL DEFAULT NULL,
  `disposalValue` decimal(14,2) NULL DEFAULT NULL,
  `lastCheckedAt` datetime(6) NULL DEFAULT NULL,
  `photoUrl` varchar(500) NULL DEFAULT NULL,
  `notes` text NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND INDEX_NAME = 'uq_bo_asset_reference') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD UNIQUE INDEX `uq_bo_asset_reference` (`companyId`,`reference`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND INDEX_NAME = 'idx_bo_asset_company_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD INDEX `idx_bo_asset_company_status` (`companyId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND INDEX_NAME = 'idx_bo_asset_branch') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD INDEX `idx_bo_asset_branch` (`branchId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND INDEX_NAME = 'idx_bo_asset_assignee') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD INDEX `idx_bo_asset_assignee` (`assignedToUserId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND INDEX_NAME = 'idx_bo_asset_serial') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD INDEX `idx_bo_asset_serial` (`serialNumber`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND INDEX_NAME = 'idx_bo_asset_barcode') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD INDEX `idx_bo_asset_barcode` (`barcode`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 9) Logistique interne : historique des biens
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_asset_movements` (',
  '
  `id` varchar(36) NOT NULL,
  `assetId` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `type` enum(''ACQUIRED'',''ASSIGNED'',''RETURNED'',''TRANSFERRED'',''REPAIR_SENT'',''REPAIR_RETURNED'',''CONDITION_CHANGED'',''INVENTORY_CHECK'',''LOST'',''FOUND'',''DISPOSED'',''UPDATED'') NOT NULL,
  `fromBranchId` varchar(36) NULL DEFAULT NULL,
  `toBranchId` varchar(36) NULL DEFAULT NULL,
  `fromUserId` varchar(36) NULL DEFAULT NULL,
  `toUserId` varchar(36) NULL DEFAULT NULL,
  `fromStatus` varchar(20) NULL DEFAULT NULL,
  `toStatus` varchar(20) NULL DEFAULT NULL,
  `fromCondition` varchar(20) NULL DEFAULT NULL,
  `toCondition` varchar(20) NULL DEFAULT NULL,
  `location` varchar(150) NULL DEFAULT NULL,
  `amount` decimal(14,2) NULL DEFAULT NULL,
  `note` varchar(500) NULL DEFAULT NULL,
  `performedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements' AND INDEX_NAME = 'idx_bo_asset_mvt_asset_date') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_asset_movements` ADD INDEX `idx_bo_asset_mvt_asset_date` (`assetId`,`createdAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements' AND INDEX_NAME = 'idx_bo_asset_mvt_company_date') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_asset_movements` ADD INDEX `idx_bo_asset_mvt_company_date` (`companyId`,`createdAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 10) Clés étrangères (colonne alignée sur la table référencée → évite l'erreur #3780)
-- ---------------------------------------------------------------------
-- bo_fleet_vehicles.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND CONSTRAINT_NAME = 'fk_fleet_vehicle_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` ADD CONSTRAINT `fk_fleet_vehicle_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_fleet_vehicles.branchId → branches.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'branchId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND CONSTRAINT_NAME = 'fk_fleet_vehicle_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` MODIFY `branchId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` ADD CONSTRAINT `fk_fleet_vehicle_branch` FOREIGN KEY (`branchId`) REFERENCES `', @db, '`.`branches` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_fleet_vehicles.assignedDriverId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'assignedDriverId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND CONSTRAINT_NAME = 'fk_fleet_vehicle_driver' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` MODIFY `assignedDriverId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` ADD CONSTRAINT `fk_fleet_vehicle_driver` FOREIGN KEY (`assignedDriverId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_fleet_missions.vehicleId → bo_fleet_vehicles.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_missions' AND COLUMN_NAME = 'vehicleId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_missions' AND CONSTRAINT_NAME = 'fk_fleet_mission_vehicle' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_missions` MODIFY `vehicleId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_missions` ADD CONSTRAINT `fk_fleet_mission_vehicle` FOREIGN KEY (`vehicleId`) REFERENCES `', @db, '`.`bo_fleet_vehicles` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_fleet_missions.driverId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_missions' AND COLUMN_NAME = 'driverId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_missions' AND CONSTRAINT_NAME = 'fk_fleet_mission_driver' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_missions` MODIFY `driverId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_missions` ADD CONSTRAINT `fk_fleet_mission_driver` FOREIGN KEY (`driverId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_fleet_fuel_logs.vehicleId → bo_fleet_vehicles.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_fuel_logs' AND COLUMN_NAME = 'vehicleId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_fuel_logs' AND CONSTRAINT_NAME = 'fk_fleet_fuel_vehicle' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_fuel_logs` MODIFY `vehicleId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_fuel_logs` ADD CONSTRAINT `fk_fleet_fuel_vehicle` FOREIGN KEY (`vehicleId`) REFERENCES `', @db, '`.`bo_fleet_vehicles` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_fleet_fuel_logs.driverId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_fuel_logs' AND COLUMN_NAME = 'driverId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_fuel_logs' AND CONSTRAINT_NAME = 'fk_fleet_fuel_driver' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_fuel_logs` MODIFY `driverId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_fuel_logs` ADD CONSTRAINT `fk_fleet_fuel_driver` FOREIGN KEY (`driverId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_fleet_maintenances.vehicleId → bo_fleet_vehicles.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_maintenances' AND COLUMN_NAME = 'vehicleId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_maintenances' AND CONSTRAINT_NAME = 'fk_fleet_maint_vehicle' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_maintenances` MODIFY `vehicleId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_maintenances` ADD CONSTRAINT `fk_fleet_maint_vehicle` FOREIGN KEY (`vehicleId`) REFERENCES `', @db, '`.`bo_fleet_vehicles` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_fleet_documents.vehicleId → bo_fleet_vehicles.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_documents' AND COLUMN_NAME = 'vehicleId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_documents' AND CONSTRAINT_NAME = 'fk_fleet_doc_vehicle' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_documents` MODIFY `vehicleId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_documents` ADD CONSTRAINT `fk_fleet_doc_vehicle` FOREIGN KEY (`vehicleId`) REFERENCES `', @db, '`.`bo_fleet_vehicles` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_asset_categories.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories' AND CONSTRAINT_NAME = 'fk_bo_asset_category_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_categories` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_categories` ADD CONSTRAINT `fk_bo_asset_category_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_assets.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND CONSTRAINT_NAME = 'fk_bo_asset_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_assets` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD CONSTRAINT `fk_bo_asset_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_assets.categoryId → bo_asset_categories.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'categoryId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND CONSTRAINT_NAME = 'fk_bo_asset_category' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_assets` MODIFY `categoryId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD CONSTRAINT `fk_bo_asset_category` FOREIGN KEY (`categoryId`) REFERENCES `', @db, '`.`bo_asset_categories` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_assets.branchId → branches.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'branchId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND CONSTRAINT_NAME = 'fk_bo_asset_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_assets` MODIFY `branchId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD CONSTRAINT `fk_bo_asset_branch` FOREIGN KEY (`branchId`) REFERENCES `', @db, '`.`branches` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_assets.assignedToUserId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'assignedToUserId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND CONSTRAINT_NAME = 'fk_bo_asset_assignee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_assets` MODIFY `assignedToUserId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD CONSTRAINT `fk_bo_asset_assignee` FOREIGN KEY (`assignedToUserId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_asset_movements.assetId → bo_assets.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements' AND COLUMN_NAME = 'assetId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements' AND CONSTRAINT_NAME = 'fk_bo_asset_mvt_asset' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_movements` MODIFY `assetId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_movements` ADD CONSTRAINT `fk_bo_asset_mvt_asset` FOREIGN KEY (`assetId`) REFERENCES `', @db, '`.`bo_assets` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_asset_movements.performedById → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements' AND COLUMN_NAME = 'performedById' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements' AND CONSTRAINT_NAME = 'fk_bo_asset_mvt_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_movements` MODIFY `performedById` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_movements` ADD CONSTRAINT `fk_bo_asset_mvt_user` FOREIGN KEY (`performedById`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET FOREIGN_KEY_CHECKS = @OLD_FK;

-- ---------------------------------------------------------------------
-- Vérification
-- ---------------------------------------------------------------------
-- a) Les 8 tables de la logistique interne + charroi
SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('bo_fleet_vehicles','bo_fleet_missions','bo_fleet_fuel_logs','bo_fleet_maintenances','bo_fleet_documents','bo_asset_categories','bo_assets','bo_asset_movements')
 ORDER BY TABLE_NAME;

-- b) Anciennes tables de transfert encore présentes (doit être vide ;
--    sinon elles contenaient des données : relancez avec @force_drop = 1)
SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('bo_logistics_transfers', 'bo_logistics_transfer_items');

-- c) bo_fleet_missions.transferId (doit être vide)
SELECT COLUMN_NAME FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_missions' AND COLUMN_NAME = 'transferId';
