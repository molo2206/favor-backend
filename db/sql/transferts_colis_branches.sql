-- =====================================================================
-- Transferts de colis entre branches + pointage à l'arrivée
-- Tables : parcel_transfers, parcel_transfer_items, parcel_checkins, parcel_checkin_items
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- Ne modifie AUCUNE table existante (seulement les 4 nouvelles tables).
-- Prérequis : db/sql/supply_branch_stock_logistique.sql déjà exécuté (stock des branches).
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- Migration équivalente : db/migrations/1794268800000-ParcelTransfersCheckins.ts
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'shipments'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

-- ⚠️ Contrôle : doit afficher le nom de VOTRE base (NULL = table shipments introuvable)
SELECT @db AS base_modifiee;

SET @coll = COALESCE((SELECT TABLE_COLLATION FROM information_schema.TABLES
                       WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'shipments' LIMIT 1), 'utf8mb4_unicode_ci');
SET @cs = COALESCE((SELECT CHARACTER_SET_NAME FROM information_schema.COLLATIONS
                     WHERE COLLATION_NAME = @coll LIMIT 1), 'utf8mb4');
SET @OLD_FK = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1) parcel_transfers : Transferts (en-tête)
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`parcel_transfers` (',
  '
  `id` varchar(36) NOT NULL,
  `code` varchar(30) NOT NULL,
  `fromBranchId` varchar(36) NOT NULL,
  `toBranchId` varchar(36) NOT NULL,
  `companyId` varchar(36) NULL DEFAULT NULL,
  `ltaId` varchar(36) NULL DEFAULT NULL,
  `status` enum(''IN_TRANSIT'',''RECEIVED'',''PARTIALLY_RECEIVED'',''CLOSED'',''CANCELLED'') NOT NULL DEFAULT ''IN_TRANSIT'',
  `parcelsCount` int NOT NULL DEFAULT 0,
  `piecesCount` int NOT NULL DEFAULT 0,
  `receivedPieces` int NOT NULL DEFAULT 0,
  `missingPieces` int NOT NULL DEFAULT 0,
  `returnedPieces` int NOT NULL DEFAULT 0,
  `note` text NULL,
  `sentById` varchar(36) NULL DEFAULT NULL,
  `sentAt` datetime(6) NULL DEFAULT NULL,
  `receivedById` varchar(36) NULL DEFAULT NULL,
  `receivedAt` datetime(6) NULL DEFAULT NULL,
  `cancelledById` varchar(36) NULL DEFAULT NULL,
  `cancelledAt` datetime(6) NULL DEFAULT NULL,
  `cancelReason` varchar(255) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND INDEX_NAME = 'uq_pt_code') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` ADD UNIQUE INDEX `uq_pt_code` (`code`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND INDEX_NAME = 'idx_pt_from_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` ADD INDEX `idx_pt_from_status` (`fromBranchId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND INDEX_NAME = 'idx_pt_to_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` ADD INDEX `idx_pt_to_status` (`toBranchId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND INDEX_NAME = 'idx_pt_lta') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` ADD INDEX `idx_pt_lta` (`ltaId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 2) parcel_transfer_items : Colis d'un transfert
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`parcel_transfer_items` (',
  '
  `id` varchar(36) NOT NULL,
  `transferId` varchar(36) NOT NULL,
  `shipmentId` varchar(36) NOT NULL,
  `fromStockId` varchar(36) NOT NULL,
  `toStockId` varchar(36) NULL DEFAULT NULL,
  `trackingNumber` varchar(100) NOT NULL,
  `description` varchar(255) NULL DEFAULT NULL,
  `clientName` varchar(150) NULL DEFAULT NULL,
  `clientPhone` varchar(50) NULL DEFAULT NULL,
  `quantity` int NOT NULL,
  `receivedQty` int NOT NULL DEFAULT 0,
  `returnedQty` int NOT NULL DEFAULT 0,
  `status` enum(''IN_TRANSIT'',''RECEIVED'',''PARTIAL'',''MISSING'',''RETURNED'',''CANCELLED'') NOT NULL DEFAULT ''IN_TRANSIT'',
  `outMovementId` varchar(36) NULL DEFAULT NULL,
  `inMovementId` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfer_items' AND INDEX_NAME = 'uq_pti_transfer_shipment') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_transfer_items` ADD UNIQUE INDEX `uq_pti_transfer_shipment` (`transferId`,`shipmentId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfer_items' AND INDEX_NAME = 'idx_pti_shipment') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_transfer_items` ADD INDEX `idx_pti_shipment` (`shipmentId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 3) parcel_checkins : Séances de pointage
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`parcel_checkins` (',
  '
  `id` varchar(36) NOT NULL,
  `code` varchar(30) NOT NULL,
  `type` enum(''LTA_ARRIVAL'',''TRANSFER_RECEPTION'') NOT NULL,
  `status` enum(''OPEN'',''CLOSED'',''CANCELLED'') NOT NULL DEFAULT ''OPEN'',
  `branchId` varchar(36) NOT NULL,
  `companyId` varchar(36) NULL DEFAULT NULL,
  `ltaId` varchar(36) NULL DEFAULT NULL,
  `transferId` varchar(36) NULL DEFAULT NULL,
  `shipmentStatus` varchar(40) NULL DEFAULT NULL,
  `expectedParcels` int NOT NULL DEFAULT 0,
  `expectedPieces` int NOT NULL DEFAULT 0,
  `checkedParcels` int NOT NULL DEFAULT 0,
  `checkedPieces` int NOT NULL DEFAULT 0,
  `missingParcels` int NOT NULL DEFAULT 0,
  `missingPieces` int NOT NULL DEFAULT 0,
  `unexpectedParcels` int NOT NULL DEFAULT 0,
  `unknownCodes` int NOT NULL DEFAULT 0,
  `damagedParcels` int NOT NULL DEFAULT 0,
  `note` text NULL,
  `openedById` varchar(36) NULL DEFAULT NULL,
  `closedById` varchar(36) NULL DEFAULT NULL,
  `closedAt` datetime(6) NULL DEFAULT NULL,
  `cancelReason` varchar(255) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND INDEX_NAME = 'uq_pc_code') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` ADD UNIQUE INDEX `uq_pc_code` (`code`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND INDEX_NAME = 'idx_pc_branch_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` ADD INDEX `idx_pc_branch_status` (`branchId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND INDEX_NAME = 'idx_pc_lta') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` ADD INDEX `idx_pc_lta` (`ltaId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND INDEX_NAME = 'idx_pc_transfer') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` ADD INDEX `idx_pc_transfer` (`transferId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 4) parcel_checkin_items : Colis pointés
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`parcel_checkin_items` (',
  '
  `id` varchar(36) NOT NULL,
  `checkinId` varchar(36) NOT NULL,
  `shipmentId` varchar(36) NULL DEFAULT NULL,
  `trackingNumber` varchar(100) NOT NULL,
  `description` varchar(255) NULL DEFAULT NULL,
  `clientName` varchar(150) NULL DEFAULT NULL,
  `clientPhone` varchar(50) NULL DEFAULT NULL,
  `expectedQty` int NOT NULL DEFAULT 0,
  `checkedQty` int NOT NULL DEFAULT 0,
  `status` enum(''PENDING'',''PARTIAL'',''CHECKED'',''MISSING'',''UNEXPECTED'',''UNKNOWN'',''ALREADY_RECEIVED'') NOT NULL DEFAULT ''PENDING'',
  `damaged` tinyint NOT NULL DEFAULT 0,
  `note` text NULL,
  `transferItemId` varchar(36) NULL DEFAULT NULL,
  `stockId` varchar(36) NULL DEFAULT NULL,
  `movementId` varchar(36) NULL DEFAULT NULL,
  `closeResult` varchar(500) NULL DEFAULT NULL,
  `firstCheckedAt` datetime(6) NULL DEFAULT NULL,
  `lastCheckedAt` datetime(6) NULL DEFAULT NULL,
  `checkedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkin_items' AND INDEX_NAME = 'uq_pci_checkin_tracking') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_checkin_items` ADD UNIQUE INDEX `uq_pci_checkin_tracking` (`checkinId`,`trackingNumber`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkin_items' AND INDEX_NAME = 'idx_pci_checkin_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_checkin_items` ADD INDEX `idx_pci_checkin_status` (`checkinId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkin_items' AND INDEX_NAME = 'idx_pci_shipment') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`parcel_checkin_items` ADD INDEX `idx_pci_shipment` (`shipmentId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 5) Clés étrangères
--    (chaque colonne est d'abord alignée sur `table référencée`.`id` → évite l'erreur #3780)
-- ---------------------------------------------------------------------
-- parcel_transfers.fromBranchId → branches.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND COLUMN_NAME = 'fromBranchId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND CONSTRAINT_NAME = 'fk_pt_from_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` MODIFY `fromBranchId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` ADD CONSTRAINT `fk_pt_from_branch` FOREIGN KEY (`fromBranchId`) REFERENCES `', @db, '`.`branches` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_transfers.toBranchId → branches.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND COLUMN_NAME = 'toBranchId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND CONSTRAINT_NAME = 'fk_pt_to_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` MODIFY `toBranchId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` ADD CONSTRAINT `fk_pt_to_branch` FOREIGN KEY (`toBranchId`) REFERENCES `', @db, '`.`branches` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_transfers.ltaId → lta.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lta' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lta' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lta' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND COLUMN_NAME = 'ltaId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND CONSTRAINT_NAME = 'fk_pt_lta' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` MODIFY `ltaId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` ADD CONSTRAINT `fk_pt_lta` FOREIGN KEY (`ltaId`) REFERENCES `', @db, '`.`lta` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_transfers.sentById → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND COLUMN_NAME = 'sentById' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND CONSTRAINT_NAME = 'fk_pt_sent_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` MODIFY `sentById` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` ADD CONSTRAINT `fk_pt_sent_by` FOREIGN KEY (`sentById`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_transfers.receivedById → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND COLUMN_NAME = 'receivedById' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND CONSTRAINT_NAME = 'fk_pt_received_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` MODIFY `receivedById` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfers` ADD CONSTRAINT `fk_pt_received_by` FOREIGN KEY (`receivedById`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_transfer_items.transferId → parcel_transfers.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfer_items' AND COLUMN_NAME = 'transferId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_transfer_items' AND CONSTRAINT_NAME = 'fk_pti_transfer' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfer_items` MODIFY `transferId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfer_items` ADD CONSTRAINT `fk_pti_transfer` FOREIGN KEY (`transferId`) REFERENCES `', @db, '`.`parcel_transfers` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_transfer_items.shipmentId → shipments.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'shipments' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'shipments' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'shipments' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfer_items' AND COLUMN_NAME = 'shipmentId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_transfer_items' AND CONSTRAINT_NAME = 'fk_pti_shipment' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfer_items` MODIFY `shipmentId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_transfer_items` ADD CONSTRAINT `fk_pti_shipment` FOREIGN KEY (`shipmentId`) REFERENCES `', @db, '`.`shipments` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_checkins.branchId → branches.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND COLUMN_NAME = 'branchId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND CONSTRAINT_NAME = 'fk_pc_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` MODIFY `branchId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` ADD CONSTRAINT `fk_pc_branch` FOREIGN KEY (`branchId`) REFERENCES `', @db, '`.`branches` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_checkins.ltaId → lta.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lta' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lta' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'lta' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND COLUMN_NAME = 'ltaId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND CONSTRAINT_NAME = 'fk_pc_lta' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` MODIFY `ltaId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` ADD CONSTRAINT `fk_pc_lta` FOREIGN KEY (`ltaId`) REFERENCES `', @db, '`.`lta` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_checkins.transferId → parcel_transfers.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_transfers' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND COLUMN_NAME = 'transferId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND CONSTRAINT_NAME = 'fk_pc_transfer' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` MODIFY `transferId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` ADD CONSTRAINT `fk_pc_transfer` FOREIGN KEY (`transferId`) REFERENCES `', @db, '`.`parcel_transfers` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_checkins.openedById → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND COLUMN_NAME = 'openedById' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND CONSTRAINT_NAME = 'fk_pc_opened_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` MODIFY `openedById` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` ADD CONSTRAINT `fk_pc_opened_by` FOREIGN KEY (`openedById`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_checkins.closedById → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND COLUMN_NAME = 'closedById' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND CONSTRAINT_NAME = 'fk_pc_closed_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` MODIFY `closedById` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkins` ADD CONSTRAINT `fk_pc_closed_by` FOREIGN KEY (`closedById`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_checkin_items.checkinId → parcel_checkins.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkins' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkin_items' AND COLUMN_NAME = 'checkinId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_checkin_items' AND CONSTRAINT_NAME = 'fk_pci_checkin' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkin_items` MODIFY `checkinId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkin_items` ADD CONSTRAINT `fk_pci_checkin` FOREIGN KEY (`checkinId`) REFERENCES `', @db, '`.`parcel_checkins` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_checkin_items.shipmentId → shipments.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'shipments' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'shipments' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'shipments' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkin_items' AND COLUMN_NAME = 'shipmentId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_checkin_items' AND CONSTRAINT_NAME = 'fk_pci_shipment' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkin_items` MODIFY `shipmentId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkin_items` ADD CONSTRAINT `fk_pci_shipment` FOREIGN KEY (`shipmentId`) REFERENCES `', @db, '`.`shipments` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- parcel_checkin_items.checkedById → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'parcel_checkin_items' AND COLUMN_NAME = 'checkedById' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'parcel_checkin_items' AND CONSTRAINT_NAME = 'fk_pci_checked_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkin_items` MODIFY `checkedById` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`parcel_checkin_items` ADD CONSTRAINT `fk_pci_checked_by` FOREIGN KEY (`checkedById`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET FOREIGN_KEY_CHECKS = @OLD_FK;

-- ---------------------------------------------------------------------
-- Vérification : doit lister les 4 tables
-- ---------------------------------------------------------------------
SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('parcel_transfers','parcel_transfer_items','parcel_checkins','parcel_checkin_items')
 ORDER BY TABLE_NAME;
