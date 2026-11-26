-- =====================================================================
-- MISE À JOUR — Logistique interne, charroi et média
--   • Biens : quantités en stock, entrées, sorties partielles (bo_asset_assignments), image partout
--   • Demandes de matériel : demande → validation → sortie (bo_material_requests / _items)
--   • Logisticiens désignés (bo_logistics_managers)
--   • Charroi = tout le matériel roulant : types BICYCLE / TRICYCLE, carburant NONE,
--     immatriculation facultative + n° interne (ENG-0001), image des missions et entretiens
--   • Média : équipe gérée par les RH (bo_media_team_members retirée),
--     réseaux sociaux remplacés par des publications internes (bo_media_publications / _stats)
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ✅ Base détectée automatiquement (celle qui contient `company`), même si
--    « information_schema » est sélectionnée dans phpMyAdmin.
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois, APRÈS
--    supply_branch_stock_logistique.sql et backoffice_media.sql.
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'company'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

-- ⚠️ Contrôle : doit afficher le nom de VOTRE base
SELECT @db AS base_modifiee;

-- 1 = supprimer aussi les anciennes tables (équipe média, réseaux sociaux) même si elles contiennent des données
-- 0 = (défaut) ne supprimer que les tables vides ; les autres restent (inutilisées)
SET @force_drop = 0;

SET @coll = COALESCE((SELECT TABLE_COLLATION FROM information_schema.TABLES
                       WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' LIMIT 1), 'utf8mb4_unicode_ci');
SET @cs = COALESCE((SELECT CHARACTER_SET_NAME FROM information_schema.COLLATIONS
                     WHERE COLLATION_NAME = @coll LIMIT 1), 'utf8mb4');
SET @OLD_FK = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1) Biens : la colonne « quantité en stock » existe-t-elle déjà ? (sert à l'initialisation)
-- ---------------------------------------------------------------------
SET @had_qty_available = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'quantityAvailable') > 0;

-- ---------------------------------------------------------------------
-- 2) Nouvelles colonnes
-- ---------------------------------------------------------------------
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets') > 0 AND NOT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'quantityAvailable') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD COLUMN ', '`quantityAvailable` int NOT NULL DEFAULT 1'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets') > 0 AND NOT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'unit') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_assets` ADD COLUMN ', '`unit` varchar(20) NOT NULL DEFAULT ''pièce'''), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories') > 0 AND NOT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories' AND COLUMN_NAME = 'photoUrl') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_categories` ADD COLUMN ', '`photoUrl` varchar(500) NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements') > 0 AND NOT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements' AND COLUMN_NAME = 'quantity') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_movements` ADD COLUMN ', '`quantity` int NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements') > 0 AND NOT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements' AND COLUMN_NAME = 'photoUrl') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_movements` ADD COLUMN ', '`photoUrl` varchar(500) NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements') > 0 AND NOT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements' AND COLUMN_NAME = 'assignmentId') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_movements` ADD COLUMN ', '`assignmentId` varchar(36) NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements') > 0 AND NOT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements' AND COLUMN_NAME = 'requestId') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_movements` ADD COLUMN ', '`requestId` varchar(36) NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles') > 0 AND NOT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'internalNumber') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` ADD COLUMN ', '`internalNumber` varchar(30) NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_missions') > 0 AND NOT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_missions' AND COLUMN_NAME = 'photoUrl') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_missions` ADD COLUMN ', '`photoUrl` varchar(500) NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_maintenances') > 0 AND NOT (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_maintenances' AND COLUMN_NAME = 'photoUrl') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_maintenances` ADD COLUMN ', '`photoUrl` varchar(500) NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 3) Colonnes modifiées (plaque et marque facultatives, nouveaux types d'engins, carburant NONE, mouvement STOCK_IN)
-- ---------------------------------------------------------------------
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'plateNumber') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` MODIFY ', '`plateNumber` varchar(30) NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'brand') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` MODIFY ', '`brand` varchar(80) NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'type') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` MODIFY ', '`type` enum(''CAR'',''PICKUP'',''VAN'',''TRUCK'',''MOTORBIKE'',''BUS'',''BICYCLE'',''TRICYCLE'',''OTHER'') NOT NULL DEFAULT ''CAR'''), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'fuelType') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` MODIFY ', '`fuelType` enum(''PETROL'',''DIESEL'',''ELECTRIC'',''HYBRID'',''NONE'',''OTHER'') NOT NULL DEFAULT ''DIESEL'''), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_movements' AND COLUMN_NAME = 'type') > 0, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_movements` MODIFY ', '`type` enum(''ACQUIRED'',''STOCK_IN'',''ASSIGNED'',''RETURNED'',''TRANSFERRED'',''REPAIR_SENT'',''REPAIR_RETURNED'',''CONDITION_CHANGED'',''INVENTORY_CHECK'',''LOST'',''FOUND'',''DISPOSED'',''UPDATED'') NOT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 4) Nouvelles tables
-- ---------------------------------------------------------------------
-- 4.1) Remises de biens aux employés (sorties partielles, quantités)
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_asset_assignments` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `assetId` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `returnedQuantity` int NOT NULL DEFAULT 0,
  `status` enum(''ACTIVE'',''RETURNED'') NOT NULL DEFAULT ''ACTIVE'',
  `requestId` varchar(36) NULL DEFAULT NULL,
  `assignedAt` datetime(6) NOT NULL,
  `returnedAt` datetime(6) NULL DEFAULT NULL,
  `assignedById` varchar(36) NULL DEFAULT NULL,
  `note` varchar(500) NULL DEFAULT NULL,
  `photoUrl` varchar(500) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_assignments' AND INDEX_NAME = 'idx_bo_asset_assignment_asset') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_asset_assignments` ADD INDEX `idx_bo_asset_assignment_asset` (`assetId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_assignments' AND INDEX_NAME = 'idx_bo_asset_assignment_user') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_asset_assignments` ADD INDEX `idx_bo_asset_assignment_user` (`userId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_assignments' AND INDEX_NAME = 'idx_bo_asset_assignment_company') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_asset_assignments` ADD INDEX `idx_bo_asset_assignment_company` (`companyId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- 4.2) Logisticiens désignés
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_logistics_managers` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_logistics_managers' AND INDEX_NAME = 'uq_bo_logistics_manager') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_logistics_managers` ADD UNIQUE INDEX `uq_bo_logistics_manager` (`companyId`,`userId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- 4.3) Demandes de matériel
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_material_requests` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `reference` varchar(30) NOT NULL,
  `requesterId` varchar(36) NOT NULL,
  `branchId` varchar(36) NULL DEFAULT NULL,
  `reason` varchar(500) NOT NULL,
  `priority` enum(''LOW'',''NORMAL'',''HIGH'',''URGENT'') NOT NULL DEFAULT ''NORMAL'',
  `neededBy` date NULL DEFAULT NULL,
  `status` enum(''PENDING'',''APPROVED'',''PARTIALLY_ISSUED'',''ISSUED'',''REJECTED'',''CANCELLED'') NOT NULL DEFAULT ''PENDING'',
  `reviewedById` varchar(36) NULL DEFAULT NULL,
  `reviewedAt` datetime(6) NULL DEFAULT NULL,
  `reviewNote` varchar(500) NULL DEFAULT NULL,
  `issuedAt` datetime(6) NULL DEFAULT NULL,
  `photoUrl` varchar(500) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND INDEX_NAME = 'uq_bo_material_request_reference') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_material_requests` ADD UNIQUE INDEX `uq_bo_material_request_reference` (`companyId`,`reference`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND INDEX_NAME = 'idx_bo_material_request_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_material_requests` ADD INDEX `idx_bo_material_request_status` (`companyId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND INDEX_NAME = 'idx_bo_material_request_requester') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_material_requests` ADD INDEX `idx_bo_material_request_requester` (`requesterId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- 4.4) Lignes des demandes de matériel
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_material_request_items` (',
  '
  `id` varchar(36) NOT NULL,
  `requestId` varchar(36) NOT NULL,
  `assetId` varchar(36) NULL DEFAULT NULL,
  `categoryId` varchar(36) NULL DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `quantityRequested` int NOT NULL DEFAULT 1,
  `quantityApproved` int NULL DEFAULT NULL,
  `quantityIssued` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_request_items' AND INDEX_NAME = 'idx_bo_material_request_item_request') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_material_request_items` ADD INDEX `idx_bo_material_request_item_request` (`requestId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- 4.5) Média interne : publications
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_publications` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `projectId` varchar(36) NULL DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `description` text NULL,
  `type` enum(''PHOTO'',''VIDEO'',''AUDIO'',''TEXT'',''DOCUMENT'',''OTHER'') NOT NULL DEFAULT ''PHOTO'',
  `channels` json NULL,
  `coverUrl` varchar(500) NULL DEFAULT NULL,
  `mediaFileIds` json NULL,
  `status` enum(''DRAFT'',''PUBLISHED'',''ARCHIVED'') NOT NULL DEFAULT ''DRAFT'',
  `publishedAt` datetime(6) NULL DEFAULT NULL,
  `views` int NOT NULL DEFAULT 0,
  `likes` int NOT NULL DEFAULT 0,
  `comments` int NOT NULL DEFAULT 0,
  `shares` int NOT NULL DEFAULT 0,
  `lastStatsOn` date NULL DEFAULT NULL,
  `notes` varchar(1000) NULL DEFAULT NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_publications' AND INDEX_NAME = 'idx_bo_media_publication_company') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_publications` ADD INDEX `idx_bo_media_publication_company` (`companyId`,`status`,`publishedAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- 4.6) Média interne : chiffres saisis par l'admin (vues, j'aime, commentaires, partages)
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_publication_stats` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `publicationId` varchar(36) NOT NULL,
  `statDate` date NOT NULL,
  `views` int NOT NULL DEFAULT 0,
  `likes` int NOT NULL DEFAULT 0,
  `comments` int NOT NULL DEFAULT 0,
  `shares` int NOT NULL DEFAULT 0,
  `note` varchar(500) NULL DEFAULT NULL,
  `recordedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_publication_stats' AND INDEX_NAME = 'uq_bo_media_publication_stat_day') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_publication_stats` ADD UNIQUE INDEX `uq_bo_media_publication_stat_day` (`publicationId`,`statDate`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_publication_stats' AND INDEX_NAME = 'idx_bo_media_publication_stat_company') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_publication_stats` ADD INDEX `idx_bo_media_publication_stat_company` (`companyId`,`statDate`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 5) Reprise des données existantes
-- ---------------------------------------------------------------------
-- 5.1) Stock disponible : seulement à la 1re exécution (colonne qui vient d'être créée)
SET @s = IF(@had_qty_available = 0 AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets') > 0, CONCAT('UPDATE `', @db, '`.`bo_assets` SET `quantityAvailable` = CASE WHEN `status` IN (''IN_USE'', ''DISPOSED'') THEN 0 ELSE `quantity` END'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 5.2) Biens déjà affectés à un employé → une remise active (toute la quantité)
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets') > 0, CONCAT('INSERT INTO `', @db, '`.`bo_asset_assignments` (`id`,`companyId`,`assetId`,`userId`,`quantity`,`returnedQuantity`,`status`,`assignedAt`,`note`) ', 'SELECT UUID(), a.`companyId`, a.`id`, a.`assignedToUserId`, a.`quantity`, 0, ''ACTIVE'', COALESCE(a.`assignedAt`, a.`updatedAt`), ''Reprise des affectations existantes'' FROM `', @db, '`.`bo_assets` a ', 'WHERE a.`assignedToUserId` IS NOT NULL AND a.`status` <> ''DISPOSED'' AND NOT EXISTS (SELECT 1 FROM `', @db, '`.`bo_asset_assignments` g WHERE g.`assetId` = a.`id`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 5.3) Charroi : n° interne ENG-0001, ENG-0002… pour les engins qui n'en ont pas
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'internalNumber') > 0, CONCAT('UPDATE `', @db, '`.`bo_fleet_vehicles` v JOIN (SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `companyId` ORDER BY `createdAt`, `id`) AS rn FROM `', @db, '`.`bo_fleet_vehicles`) x ON x.`id` = v.`id` SET v.`internalNumber` = CONCAT(''ENG-'', LPAD(x.rn, 4, ''0'')) WHERE v.`internalNumber` IS NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 5.4) Vélos : sans carburant
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND COLUMN_NAME = 'fuelType') > 0, CONCAT('UPDATE `', @db, '`.`bo_fleet_vehicles` SET `fuelType` = ''NONE'' WHERE `type` = ''BICYCLE'''), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- index uq_fleet_vehicle_internal
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles') > 0 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_fleet_vehicles' AND INDEX_NAME = 'uq_fleet_vehicle_internal') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_fleet_vehicles` ADD UNIQUE INDEX `uq_fleet_vehicle_internal` (`companyId`,`internalNumber`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 6) Clés étrangères
--    (chaque colonne est d'abord alignée sur `table référencée`.`id` → évite l'erreur #3780)
-- ---------------------------------------------------------------------
-- bo_asset_assignments.assetId → bo_assets.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_assignments' AND COLUMN_NAME = 'assetId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_asset_assignments' AND CONSTRAINT_NAME = 'fk_bo_asset_assignment_asset' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_assignments` MODIFY `assetId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_assignments` ADD CONSTRAINT `fk_bo_asset_assignment_asset` FOREIGN KEY (`assetId`) REFERENCES `', @db, '`.`bo_assets` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_asset_assignments.userId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_assignments' AND COLUMN_NAME = 'userId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_asset_assignments' AND CONSTRAINT_NAME = 'fk_bo_asset_assignment_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_assignments` MODIFY `userId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_asset_assignments` ADD CONSTRAINT `fk_bo_asset_assignment_user` FOREIGN KEY (`userId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_logistics_managers.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_logistics_managers' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_logistics_managers' AND CONSTRAINT_NAME = 'fk_bo_logistics_manager_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_logistics_managers` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_logistics_managers` ADD CONSTRAINT `fk_bo_logistics_manager_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_logistics_managers.userId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_logistics_managers' AND COLUMN_NAME = 'userId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_logistics_managers' AND CONSTRAINT_NAME = 'fk_bo_logistics_manager_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_logistics_managers` MODIFY `userId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_logistics_managers` ADD CONSTRAINT `fk_bo_logistics_manager_user` FOREIGN KEY (`userId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_material_requests.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND CONSTRAINT_NAME = 'fk_bo_material_request_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_requests` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_requests` ADD CONSTRAINT `fk_bo_material_request_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_material_requests.requesterId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND COLUMN_NAME = 'requesterId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND CONSTRAINT_NAME = 'fk_bo_material_request_requester' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_requests` MODIFY `requesterId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_requests` ADD CONSTRAINT `fk_bo_material_request_requester` FOREIGN KEY (`requesterId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_material_requests.branchId → branches.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND COLUMN_NAME = 'branchId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND CONSTRAINT_NAME = 'fk_bo_material_request_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_requests` MODIFY `branchId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_requests` ADD CONSTRAINT `fk_bo_material_request_branch` FOREIGN KEY (`branchId`) REFERENCES `', @db, '`.`branches` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_material_requests.reviewedById → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND COLUMN_NAME = 'reviewedById' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND CONSTRAINT_NAME = 'fk_bo_material_request_reviewer' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_requests` MODIFY `reviewedById` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_requests` ADD CONSTRAINT `fk_bo_material_request_reviewer` FOREIGN KEY (`reviewedById`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_material_request_items.requestId → bo_material_requests.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_requests' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_request_items' AND COLUMN_NAME = 'requestId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_material_request_items' AND CONSTRAINT_NAME = 'fk_bo_material_request_item_request' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_request_items` MODIFY `requestId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_request_items` ADD CONSTRAINT `fk_bo_material_request_item_request` FOREIGN KEY (`requestId`) REFERENCES `', @db, '`.`bo_material_requests` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_material_request_items.assetId → bo_assets.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_request_items' AND COLUMN_NAME = 'assetId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_material_request_items' AND CONSTRAINT_NAME = 'fk_bo_material_request_item_asset' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_request_items` MODIFY `assetId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_request_items` ADD CONSTRAINT `fk_bo_material_request_item_asset` FOREIGN KEY (`assetId`) REFERENCES `', @db, '`.`bo_assets` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_material_request_items.categoryId → bo_asset_categories.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_asset_categories' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_material_request_items' AND COLUMN_NAME = 'categoryId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_material_request_items' AND CONSTRAINT_NAME = 'fk_bo_material_request_item_category' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_request_items` MODIFY `categoryId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_material_request_items` ADD CONSTRAINT `fk_bo_material_request_item_category` FOREIGN KEY (`categoryId`) REFERENCES `', @db, '`.`bo_asset_categories` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_publications.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_publications' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_publications' AND CONSTRAINT_NAME = 'fk_bo_media_publication_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_publications` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_publications` ADD CONSTRAINT `fk_bo_media_publication_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_publications.projectId → bo_media_projects.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_publications' AND COLUMN_NAME = 'projectId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_publications' AND CONSTRAINT_NAME = 'fk_bo_media_publication_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_publications` MODIFY `projectId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_publications` ADD CONSTRAINT `fk_bo_media_publication_project` FOREIGN KEY (`projectId`) REFERENCES `', @db, '`.`bo_media_projects` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_publications.createdById → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_publications' AND COLUMN_NAME = 'createdById' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_publications' AND CONSTRAINT_NAME = 'fk_bo_media_publication_creator' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_publications` MODIFY `createdById` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_publications` ADD CONSTRAINT `fk_bo_media_publication_creator` FOREIGN KEY (`createdById`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_publication_stats.publicationId → bo_media_publications.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_publications' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_publications' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_publications' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_publication_stats' AND COLUMN_NAME = 'publicationId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_publication_stats' AND CONSTRAINT_NAME = 'fk_bo_media_publication_stat_publication' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_publication_stats` MODIFY `publicationId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_publication_stats` ADD CONSTRAINT `fk_bo_media_publication_stat_publication` FOREIGN KEY (`publicationId`) REFERENCES `', @db, '`.`bo_media_publications` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 7) Anciennes tables retirées : équipe média (→ RH) et réseaux sociaux (→ publications internes)
--    Supprimées si elles sont vides (ou toujours si @force_drop = 1)
-- ---------------------------------------------------------------------
-- bo_media_team_members
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_team_members') > 0, CONCAT('SELECT COUNT(*) INTO @cnt FROM `', @db, '`.`bo_media_team_members`'), 'SELECT 0 INTO @cnt');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_team_members') > 0 AND (@cnt = 0 OR @force_drop = 1), CONCAT('DROP TABLE `', @db, '`.`bo_media_team_members`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_account_daily_stats
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_account_daily_stats') > 0, CONCAT('SELECT COUNT(*) INTO @cnt FROM `', @db, '`.`bo_social_account_daily_stats`'), 'SELECT 0 INTO @cnt');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_account_daily_stats') > 0 AND (@cnt = 0 OR @force_drop = 1), CONCAT('DROP TABLE `', @db, '`.`bo_social_account_daily_stats`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_post_daily_stats
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_daily_stats') > 0, CONCAT('SELECT COUNT(*) INTO @cnt FROM `', @db, '`.`bo_social_post_daily_stats`'), 'SELECT 0 INTO @cnt');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_daily_stats') > 0 AND (@cnt = 0 OR @force_drop = 1), CONCAT('DROP TABLE `', @db, '`.`bo_social_post_daily_stats`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_post_targets
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_targets') > 0, CONCAT('SELECT COUNT(*) INTO @cnt FROM `', @db, '`.`bo_social_post_targets`'), 'SELECT 0 INTO @cnt');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_targets') > 0 AND (@cnt = 0 OR @force_drop = 1), CONCAT('DROP TABLE `', @db, '`.`bo_social_post_targets`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_posts
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts') > 0, CONCAT('SELECT COUNT(*) INTO @cnt FROM `', @db, '`.`bo_social_posts`'), 'SELECT 0 INTO @cnt');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts') > 0 AND (@cnt = 0 OR @force_drop = 1), CONCAT('DROP TABLE `', @db, '`.`bo_social_posts`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_accounts
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts') > 0, CONCAT('SELECT COUNT(*) INTO @cnt FROM `', @db, '`.`bo_social_accounts`'), 'SELECT 0 INTO @cnt');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts') > 0 AND (@cnt = 0 OR @force_drop = 1), CONCAT('DROP TABLE `', @db, '`.`bo_social_accounts`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET FOREIGN_KEY_CHECKS = @OLD_FK;

-- Vérification 1 : les 6 nouvelles tables
SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('bo_asset_assignments','bo_logistics_managers','bo_material_requests','bo_material_request_items','bo_media_publications','bo_media_publication_stats')
 ORDER BY TABLE_NAME;

-- Vérification 2 : anciennes tables encore présentes (non vides) — à supprimer avec @force_drop = 1 si vous le souhaitez
SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('bo_media_team_members','bo_social_account_daily_stats','bo_social_post_daily_stats','bo_social_post_targets','bo_social_posts','bo_social_accounts');
