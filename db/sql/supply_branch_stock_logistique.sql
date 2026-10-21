-- =====================================================================
-- Approvisionnement des branches (stock + pointage), Supply (commande → shipment
-- + historique), BackOffice logistique interne (transferts) et charroi (flotte).
-- MySQL 8 — script IDEMPOTENT : peut être relancé sans risque.
-- ⚠️ Exécuter le fichier EN ENTIER (phpMyAdmin : onglet SQL / Importer,
--    ou : mysql -u USER -p NOM_BASE < supply_branch_stock_logistique.sql)
-- Les colonnes de clés étrangères sont alignées automatiquement sur le type,
-- le jeu de caractères et la collation de la colonne référencée (évite #3780).
-- =====================================================================

SET @OLD_FK = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

DROP PROCEDURE IF EXISTS `_sbl_exec`;
DROP PROCEDURE IF EXISTS `_sbl_create`;
DROP PROCEDURE IF EXISTS `_sbl_add_col`;
DROP PROCEDURE IF EXISTS `_sbl_add_idx`;
DROP PROCEDURE IF EXISTS `_sbl_add_fk`;

DELIMITER $$

CREATE PROCEDURE `_sbl_exec`(IN p_sql LONGTEXT)
BEGIN
  SET @_sbl_sql = p_sql;
  PREPARE _sbl_stmt FROM @_sbl_sql;
  EXECUTE _sbl_stmt;
  DEALLOCATE PREPARE _sbl_stmt;
END$$

-- Crée la table avec le même charset / collation que `shipments`
CREATE PROCEDURE `_sbl_create`(IN p_table VARCHAR(64), IN p_body LONGTEXT)
BEGIN
  DECLARE v_coll VARCHAR(64) DEFAULT NULL;
  DECLARE v_cs VARCHAR(64) DEFAULT NULL;
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table) THEN
    SELECT t.TABLE_COLLATION, c.CHARACTER_SET_NAME INTO v_coll, v_cs
      FROM information_schema.TABLES t
      JOIN information_schema.COLLATION_CHARACTER_SET_APPLICABILITY c ON c.COLLATION_NAME = t.TABLE_COLLATION
     WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = 'shipments' LIMIT 1;
    SET v_coll = COALESCE(v_coll, 'utf8mb4_unicode_ci');
    SET v_cs = COALESCE(v_cs, 'utf8mb4');
    CALL `_sbl_exec`(CONCAT('CREATE TABLE `', p_table, '` (', p_body, ') ENGINE=InnoDB DEFAULT CHARSET=', v_cs, ' COLLATE=', v_coll));
  END IF;
END$$

CREATE PROCEDURE `_sbl_add_col`(IN p_table VARCHAR(64), IN p_col VARCHAR(64), IN p_def TEXT)
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table)
     AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_col) THEN
    CALL `_sbl_exec`(CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_col, '` ', p_def));
  END IF;
END$$

CREATE PROCEDURE `_sbl_add_idx`(IN p_table VARCHAR(64), IN p_idx VARCHAR(64), IN p_cols TEXT, IN p_unique TINYINT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_idx) THEN
    CALL `_sbl_exec`(CONCAT('ALTER TABLE `', p_table, '` ADD ', IF(p_unique = 1, 'UNIQUE ', ''), 'INDEX `', p_idx, '` (`', REPLACE(p_cols, ',', '`,`'), '`)'));
  END IF;
END$$

-- Clé étrangère : aligne d'abord la colonne sur `ref`.`id` (type + charset + collation)
CREATE PROCEDURE `_sbl_add_fk`(IN p_table VARCHAR(64), IN p_col VARCHAR(64), IN p_ref VARCHAR(64), IN p_fk VARCHAR(64), IN p_on_delete VARCHAR(20))
BEGIN
  DECLARE v_type VARCHAR(100) DEFAULT NULL;
  DECLARE v_cs VARCHAR(64) DEFAULT NULL;
  DECLARE v_coll VARCHAR(64) DEFAULT NULL;
  DECLARE v_null VARCHAR(3) DEFAULT 'YES';
  DECLARE v_cur_type VARCHAR(100) DEFAULT NULL;
  DECLARE v_cur_coll VARCHAR(64) DEFAULT NULL;

  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_ref)
     AND NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                      WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = p_table
                        AND CONSTRAINT_NAME = p_fk AND CONSTRAINT_TYPE = 'FOREIGN KEY') THEN

    SELECT COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME INTO v_type, v_cs, v_coll
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_ref AND COLUMN_NAME = 'id' LIMIT 1;

    SELECT COLUMN_TYPE, COLLATION_NAME, IS_NULLABLE INTO v_cur_type, v_cur_coll, v_null
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_col LIMIT 1;

    IF v_type IS NOT NULL AND v_cur_type IS NOT NULL THEN
      IF v_cur_type <> v_type OR COALESCE(v_cur_coll, '') <> COALESCE(v_coll, '') THEN
        CALL `_sbl_exec`(CONCAT(
          'ALTER TABLE `', p_table, '` MODIFY `', p_col, '` ', v_type,
          IF(v_cs IS NULL, '', CONCAT(' CHARACTER SET ', v_cs, ' COLLATE ', v_coll)),
          IF(v_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')));
      END IF;
      CALL `_sbl_exec`(CONCAT(
        'ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_fk, '` FOREIGN KEY (`', p_col, '`) REFERENCES `', p_ref,
        '` (`id`) ON DELETE ', p_on_delete, ' ON UPDATE NO ACTION'));
    END IF;
  END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- 1) Shipments : lien avec la commande / sous-commande / Supply
-- ---------------------------------------------------------------------
CALL `_sbl_add_col`('shipments', 'orderId', 'varchar(36) NULL DEFAULT NULL');
CALL `_sbl_add_col`('shipments', 'subOrderId', 'varchar(36) NULL DEFAULT NULL');
CALL `_sbl_add_col`('shipments', 'supplyId', 'varchar(36) NULL DEFAULT NULL');
CALL `_sbl_add_idx`('shipments', 'idx_shipments_order', 'orderId', 0);
CALL `_sbl_add_idx`('shipments', 'idx_shipments_supply', 'supplyId', 0);

-- ---------------------------------------------------------------------
-- 2) Stock des colis par branche
-- ---------------------------------------------------------------------
CALL `_sbl_create`('branch_parcel_stocks', '
  `id` varchar(36) NOT NULL,
  `branchId` varchar(36) NOT NULL,
  `companyId` varchar(36) NULL DEFAULT NULL,
  `shipmentId` varchar(36) NOT NULL,
  `ltaId` varchar(36) NULL DEFAULT NULL,
  `trackingNumber` varchar(100) NOT NULL,
  `description` varchar(255) NULL DEFAULT NULL,
  `clientName` varchar(150) NULL DEFAULT NULL,
  `clientPhone` varchar(50) NULL DEFAULT NULL,
  `quantityIn` int NOT NULL DEFAULT 0,
  `quantityOut` int NOT NULL DEFAULT 0,
  `quantityAvailable` int NOT NULL DEFAULT 0,
  `status` enum(''IN_STOCK'',''PARTIAL'',''OUT'') NOT NULL DEFAULT ''IN_STOCK'',
  `location` varchar(100) NULL DEFAULT NULL,
  `firstReceivedAt` datetime(6) NULL DEFAULT NULL,
  `lastMovementAt` datetime(6) NULL DEFAULT NULL,
  `receivedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
');
CALL `_sbl_add_idx`('branch_parcel_stocks', 'uq_bps_branch_shipment', 'branchId,shipmentId', 1);
CALL `_sbl_add_idx`('branch_parcel_stocks', 'idx_bps_branch_status', 'branchId,status', 0);
CALL `_sbl_add_idx`('branch_parcel_stocks', 'idx_bps_shipment', 'shipmentId', 0);
CALL `_sbl_add_idx`('branch_parcel_stocks', 'idx_bps_tracking', 'trackingNumber', 0);

-- ---------------------------------------------------------------------
-- 3) Pointage : mouvements d'entrée / sortie
-- ---------------------------------------------------------------------
CALL `_sbl_create`('branch_parcel_movements', '
  `id` varchar(36) NOT NULL,
  `stockId` varchar(36) NOT NULL,
  `branchId` varchar(36) NOT NULL,
  `shipmentId` varchar(36) NOT NULL,
  `type` enum(''IN_RECEPTION'',''IN_TRANSFER'',''IN_ADJUSTMENT'',''OUT_PICKUP'',''OUT_TRANSFER'',''OUT_MANUAL'',''OUT_ADJUSTMENT'') NOT NULL,
  `quantity` int NOT NULL,
  `quantityBefore` int NOT NULL,
  `quantityAfter` int NOT NULL,
  `reason` varchar(255) NULL DEFAULT NULL,
  `note` text NULL,
  `reference` varchar(100) NULL DEFAULT NULL,
  `transferId` varchar(36) NULL DEFAULT NULL,
  `recipientName` varchar(150) NULL DEFAULT NULL,
  `recipientPhone` varchar(50) NULL DEFAULT NULL,
  `performedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
');
CALL `_sbl_add_idx`('branch_parcel_movements', 'idx_bpm_branch_date', 'branchId,createdAt', 0);
CALL `_sbl_add_idx`('branch_parcel_movements', 'idx_bpm_stock', 'stockId', 0);
CALL `_sbl_add_idx`('branch_parcel_movements', 'idx_bpm_shipment', 'shipmentId', 0);
CALL `_sbl_add_idx`('branch_parcel_movements', 'idx_bpm_transfer', 'transferId', 0);

-- ---------------------------------------------------------------------
-- 4) Supply : commande → shipment
-- ---------------------------------------------------------------------
CALL `_sbl_create`('supplies', '
  `id` varchar(36) NOT NULL,
  `reference` varchar(30) NOT NULL,
  `orderId` varchar(36) NOT NULL,
  `subOrderId` varchar(36) NULL DEFAULT NULL,
  `companyId` varchar(36) NULL DEFAULT NULL,
  `customerId` varchar(36) NULL DEFAULT NULL,
  `shipmentId` varchar(36) NULL DEFAULT NULL,
  `originBranchId` varchar(36) NULL DEFAULT NULL,
  `destinationBranchId` varchar(36) NULL DEFAULT NULL,
  `status` enum(''PENDING'',''PREPARING'',''READY_TO_SHIP'',''SHIPMENT_CREATED'',''IN_TRANSIT'',''ARRIVED'',''RECEIVED_AT_BRANCH'',''COMPLETED'',''CANCELLED'') NOT NULL DEFAULT ''PENDING'',
  `invoiceNumber` varchar(100) NULL DEFAULT NULL,
  `totalAmount` decimal(12,2) NOT NULL DEFAULT 0,
  `currency` varchar(10) NULL DEFAULT NULL,
  `itemsCount` int NOT NULL DEFAULT 0,
  `notes` text NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `shipmentCreatedAt` datetime(6) NULL DEFAULT NULL,
  `receivedAt` datetime(6) NULL DEFAULT NULL,
  `completedAt` datetime(6) NULL DEFAULT NULL,
  `cancelledAt` datetime(6) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
');
CALL `_sbl_add_idx`('supplies', 'uq_supplies_reference', 'reference', 1);
CALL `_sbl_add_idx`('supplies', 'idx_supplies_order', 'orderId', 0);
CALL `_sbl_add_idx`('supplies', 'idx_supplies_status', 'status', 0);
CALL `_sbl_add_idx`('supplies', 'idx_supplies_sub_order', 'subOrderId', 0);
CALL `_sbl_add_idx`('supplies', 'idx_supplies_company', 'companyId', 0);
CALL `_sbl_add_idx`('supplies', 'idx_supplies_shipment', 'shipmentId', 0);

-- ---------------------------------------------------------------------
-- 5) Historique complet du Supply
-- ---------------------------------------------------------------------
CALL `_sbl_create`('supply_history', '
  `id` varchar(36) NOT NULL,
  `supplyId` varchar(36) NOT NULL,
  `eventType` enum(''SUPPLY_CREATED'',''SUPPLY_STATUS_CHANGED'',''ORDER_STATUS_CHANGED'',''SHIPMENT_CREATED'',''SHIPMENT_STATUS_CHANGED'',''SHIPMENT_TRACKING'',''ADDED_TO_LTA'',''LTA_TRACKING'',''RECEIVED_AT_BRANCH'',''STOCK_MOVEMENT'',''PICKED_UP'',''TRANSFER_DISPATCHED'',''TRANSFER_RECEIVED'',''NOTE'',''CANCELLED'') NOT NULL,
  `fromStatus` varchar(50) NULL DEFAULT NULL,
  `toStatus` varchar(50) NULL DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `orderId` varchar(36) NULL DEFAULT NULL,
  `shipmentId` varchar(36) NULL DEFAULT NULL,
  `ltaId` varchar(36) NULL DEFAULT NULL,
  `branchId` varchar(36) NULL DEFAULT NULL,
  `location` varchar(255) NULL DEFAULT NULL,
  `payload` json NULL,
  `performedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
');
CALL `_sbl_add_idx`('supply_history', 'idx_supply_history_supply_date', 'supplyId,createdAt', 0);
CALL `_sbl_add_idx`('supply_history', 'idx_supply_history_shipment', 'shipmentId', 0);

-- ---------------------------------------------------------------------
-- 6) Charroi : véhicules
-- ---------------------------------------------------------------------
CALL `_sbl_create`('bo_fleet_vehicles', '
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
');
CALL `_sbl_add_idx`('bo_fleet_vehicles', 'uq_fleet_vehicle_plate', 'companyId,plateNumber', 1);
CALL `_sbl_add_idx`('bo_fleet_vehicles', 'idx_fleet_vehicle_status', 'companyId,status', 0);

-- ---------------------------------------------------------------------
-- 7) Charroi : missions
-- ---------------------------------------------------------------------
CALL `_sbl_create`('bo_fleet_missions', '
  `id` varchar(36) NOT NULL,
  `reference` varchar(30) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `vehicleId` varchar(36) NOT NULL,
  `driverId` varchar(36) NULL DEFAULT NULL,
  `transferId` varchar(36) NULL DEFAULT NULL,
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
');
CALL `_sbl_add_idx`('bo_fleet_missions', 'uq_fleet_mission_reference', 'reference', 1);
CALL `_sbl_add_idx`('bo_fleet_missions', 'idx_fleet_mission_vehicle', 'vehicleId,createdAt', 0);
CALL `_sbl_add_idx`('bo_fleet_missions', 'idx_fleet_mission_company_status', 'companyId,status', 0);

-- ---------------------------------------------------------------------
-- 8) Charroi : carburant
-- ---------------------------------------------------------------------
CALL `_sbl_create`('bo_fleet_fuel_logs', '
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
');
CALL `_sbl_add_idx`('bo_fleet_fuel_logs', 'idx_fleet_fuel_vehicle_date', 'vehicleId,filledAt', 0);
CALL `_sbl_add_idx`('bo_fleet_fuel_logs', 'idx_fleet_fuel_company_date', 'companyId,filledAt', 0);

-- ---------------------------------------------------------------------
-- 9) Charroi : entretien / pannes
-- ---------------------------------------------------------------------
CALL `_sbl_create`('bo_fleet_maintenances', '
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
');
CALL `_sbl_add_idx`('bo_fleet_maintenances', 'idx_fleet_maint_vehicle', 'vehicleId,createdAt', 0);
CALL `_sbl_add_idx`('bo_fleet_maintenances', 'idx_fleet_maint_company_status', 'companyId,status', 0);

-- ---------------------------------------------------------------------
-- 10) Charroi : documents (assurance, contrôle technique…)
-- ---------------------------------------------------------------------
CALL `_sbl_create`('bo_fleet_documents', '
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
');
CALL `_sbl_add_idx`('bo_fleet_documents', 'idx_fleet_doc_expiry', 'companyId,expiryDate', 0);
CALL `_sbl_add_idx`('bo_fleet_documents', 'idx_fleet_doc_vehicle', 'vehicleId', 0);

-- ---------------------------------------------------------------------
-- 11) Logistique interne : transferts entre branches
-- ---------------------------------------------------------------------
CALL `_sbl_create`('bo_logistics_transfers', '
  `id` varchar(36) NOT NULL,
  `reference` varchar(30) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `fromBranchId` varchar(36) NOT NULL,
  `toBranchId` varchar(36) NOT NULL,
  `vehicleId` varchar(36) NULL DEFAULT NULL,
  `driverId` varchar(36) NULL DEFAULT NULL,
  `missionId` varchar(36) NULL DEFAULT NULL,
  `status` enum(''DRAFT'',''IN_TRANSIT'',''RECEIVED'',''PARTIALLY_RECEIVED'',''CANCELLED'') NOT NULL DEFAULT ''DRAFT'',
  `plannedDepartureAt` datetime(6) NULL DEFAULT NULL,
  `dispatchedAt` datetime(6) NULL DEFAULT NULL,
  `receivedAt` datetime(6) NULL DEFAULT NULL,
  `cancelledAt` datetime(6) NULL DEFAULT NULL,
  `notes` text NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `dispatchedById` varchar(36) NULL DEFAULT NULL,
  `receivedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
');
CALL `_sbl_add_idx`('bo_logistics_transfers', 'uq_bo_transfer_reference', 'reference', 1);
CALL `_sbl_add_idx`('bo_logistics_transfers', 'idx_bo_transfer_company_status', 'companyId,status', 0);
CALL `_sbl_add_idx`('bo_logistics_transfers', 'idx_bo_transfer_from', 'fromBranchId,createdAt', 0);
CALL `_sbl_add_idx`('bo_logistics_transfers', 'idx_bo_transfer_to', 'toBranchId,createdAt', 0);

-- ---------------------------------------------------------------------
-- 12) Logistique interne : lignes de transfert
-- ---------------------------------------------------------------------
CALL `_sbl_create`('bo_logistics_transfer_items', '
  `id` varchar(36) NOT NULL,
  `transferId` varchar(36) NOT NULL,
  `stockId` varchar(36) NOT NULL,
  `shipmentId` varchar(36) NOT NULL,
  `trackingNumber` varchar(100) NULL DEFAULT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `receivedQuantity` int NOT NULL DEFAULT 0,
  `destinationStockId` varchar(36) NULL DEFAULT NULL,
  `note` varchar(500) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
');
CALL `_sbl_add_idx`('bo_logistics_transfer_items', 'idx_bo_transfer_item_transfer', 'transferId', 0);
CALL `_sbl_add_idx`('bo_logistics_transfer_items', 'idx_bo_transfer_item_shipment', 'shipmentId', 0);

-- ---------------------------------------------------------------------
-- 13) Clés étrangères (après création de toutes les tables)
-- ---------------------------------------------------------------------
CALL `_sbl_add_fk`('branch_parcel_stocks', 'branchId', 'branches', 'fk_bps_branch', 'CASCADE');
CALL `_sbl_add_fk`('branch_parcel_stocks', 'shipmentId', 'shipments', 'fk_bps_shipment', 'CASCADE');
CALL `_sbl_add_fk`('branch_parcel_stocks', 'ltaId', 'lta', 'fk_bps_lta', 'SET NULL');
CALL `_sbl_add_fk`('branch_parcel_stocks', 'receivedById', 'users', 'fk_bps_received_by', 'SET NULL');
CALL `_sbl_add_fk`('branch_parcel_movements', 'stockId', 'branch_parcel_stocks', 'fk_bpm_stock', 'CASCADE');
CALL `_sbl_add_fk`('branch_parcel_movements', 'branchId', 'branches', 'fk_bpm_branch', 'CASCADE');
CALL `_sbl_add_fk`('branch_parcel_movements', 'shipmentId', 'shipments', 'fk_bpm_shipment', 'CASCADE');
CALL `_sbl_add_fk`('branch_parcel_movements', 'performedById', 'users', 'fk_bpm_performed_by', 'SET NULL');
CALL `_sbl_add_fk`('supplies', 'orderId', 'orders', 'fk_supplies_order', 'CASCADE');
CALL `_sbl_add_fk`('supplies', 'subOrderId', 'sub_orders', 'fk_supplies_sub_order', 'SET NULL');
CALL `_sbl_add_fk`('supplies', 'companyId', 'company', 'fk_supplies_company', 'SET NULL');
CALL `_sbl_add_fk`('supplies', 'customerId', 'users', 'fk_supplies_customer', 'SET NULL');
CALL `_sbl_add_fk`('supplies', 'shipmentId', 'shipments', 'fk_supplies_shipment', 'SET NULL');
CALL `_sbl_add_fk`('supplies', 'originBranchId', 'branches', 'fk_supplies_origin_branch', 'SET NULL');
CALL `_sbl_add_fk`('supplies', 'destinationBranchId', 'branches', 'fk_supplies_dest_branch', 'SET NULL');
CALL `_sbl_add_fk`('supplies', 'createdById', 'users', 'fk_supplies_created_by', 'SET NULL');
CALL `_sbl_add_fk`('supply_history', 'supplyId', 'supplies', 'fk_supply_history_supply', 'CASCADE');
CALL `_sbl_add_fk`('supply_history', 'performedById', 'users', 'fk_supply_history_user', 'SET NULL');
CALL `_sbl_add_fk`('bo_fleet_vehicles', 'companyId', 'company', 'fk_fleet_vehicle_company', 'CASCADE');
CALL `_sbl_add_fk`('bo_fleet_vehicles', 'branchId', 'branches', 'fk_fleet_vehicle_branch', 'SET NULL');
CALL `_sbl_add_fk`('bo_fleet_vehicles', 'assignedDriverId', 'users', 'fk_fleet_vehicle_driver', 'SET NULL');
CALL `_sbl_add_fk`('bo_fleet_missions', 'vehicleId', 'bo_fleet_vehicles', 'fk_fleet_mission_vehicle', 'CASCADE');
CALL `_sbl_add_fk`('bo_fleet_missions', 'driverId', 'users', 'fk_fleet_mission_driver', 'SET NULL');
CALL `_sbl_add_fk`('bo_fleet_fuel_logs', 'vehicleId', 'bo_fleet_vehicles', 'fk_fleet_fuel_vehicle', 'CASCADE');
CALL `_sbl_add_fk`('bo_fleet_fuel_logs', 'driverId', 'users', 'fk_fleet_fuel_driver', 'SET NULL');
CALL `_sbl_add_fk`('bo_fleet_maintenances', 'vehicleId', 'bo_fleet_vehicles', 'fk_fleet_maint_vehicle', 'CASCADE');
CALL `_sbl_add_fk`('bo_fleet_documents', 'vehicleId', 'bo_fleet_vehicles', 'fk_fleet_doc_vehicle', 'CASCADE');
CALL `_sbl_add_fk`('bo_logistics_transfers', 'fromBranchId', 'branches', 'fk_bo_transfer_from', 'RESTRICT');
CALL `_sbl_add_fk`('bo_logistics_transfers', 'toBranchId', 'branches', 'fk_bo_transfer_to', 'RESTRICT');
CALL `_sbl_add_fk`('bo_logistics_transfers', 'vehicleId', 'bo_fleet_vehicles', 'fk_bo_transfer_vehicle', 'SET NULL');
CALL `_sbl_add_fk`('bo_logistics_transfers', 'driverId', 'users', 'fk_bo_transfer_driver', 'SET NULL');
CALL `_sbl_add_fk`('bo_logistics_transfers', 'missionId', 'bo_fleet_missions', 'fk_bo_transfer_mission', 'SET NULL');
CALL `_sbl_add_fk`('bo_logistics_transfer_items', 'transferId', 'bo_logistics_transfers', 'fk_bo_transfer_item_transfer', 'CASCADE');
CALL `_sbl_add_fk`('bo_logistics_transfer_items', 'stockId', 'branch_parcel_stocks', 'fk_bo_transfer_item_stock', 'RESTRICT');
CALL `_sbl_add_fk`('bo_logistics_transfer_items', 'shipmentId', 'shipments', 'fk_bo_transfer_item_shipment', 'RESTRICT');

DROP PROCEDURE IF EXISTS `_sbl_exec`;
DROP PROCEDURE IF EXISTS `_sbl_create`;
DROP PROCEDURE IF EXISTS `_sbl_add_col`;
DROP PROCEDURE IF EXISTS `_sbl_add_idx`;
DROP PROCEDURE IF EXISTS `_sbl_add_fk`;

SET FOREIGN_KEY_CHECKS = @OLD_FK;

-- Vérification rapide
SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('branch_parcel_stocks','branch_parcel_movements','supplies','supply_history',
                      'bo_fleet_vehicles','bo_fleet_missions','bo_fleet_fuel_logs','bo_fleet_maintenances',
                      'bo_fleet_documents','bo_logistics_transfers','bo_logistics_transfer_items');
