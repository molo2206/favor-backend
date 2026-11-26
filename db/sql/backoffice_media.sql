-- =====================================================================
-- BackOffice — Média : filmage, photographie, services digitaux
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ✅ Fonctionne même si « information_schema » est sélectionnée dans phpMyAdmin :
--    la base de l'application est détectée automatiquement (celle qui contient `company`).
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- ℹ️ Le matériel des tournages vient des biens de l'entreprise (`bo_assets`) :
--    exécuter d'abord supply_branch_stock_logistique.sql (sinon ce lien est ignoré, rien ne casse).
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'company'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

-- ⚠️ Contrôle : doit afficher le nom de VOTRE base (NULL = table company introuvable)
SELECT @db AS base_modifiee;

SET @coll = COALESCE((SELECT TABLE_COLLATION FROM information_schema.TABLES
                       WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' LIMIT 1), 'utf8mb4_unicode_ci');
SET @cs = COALESCE((SELECT CHARACTER_SET_NAME FROM information_schema.COLLATIONS
                     WHERE COLLATION_NAME = @coll LIMIT 1), 'utf8mb4');
SET @OLD_FK = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1) Catalogue des prestations (photo, vidéo, drone, montage, digital…)
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_services` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `name` varchar(150) NOT NULL,
  `code` varchar(20) NULL DEFAULT NULL,
  `category` enum(''PHOTOGRAPHY'',''VIDEOGRAPHY'',''DRONE'',''LIVE_STREAMING'',''EDITING'',''GRAPHIC_DESIGN'',''SOCIAL_MEDIA'',''WEB_DIGITAL'',''PRINTING'',''OTHER'') NOT NULL DEFAULT ''OTHER'',
  `description` text NULL,
  `unit` enum(''HOUR'',''DAY'',''SESSION'',''PROJECT'',''ITEM'',''MONTH'') NOT NULL DEFAULT ''SESSION'',
  `unitPrice` decimal(14,2) NOT NULL DEFAULT 0,
  `currency` varchar(10) NOT NULL DEFAULT ''USD'',
  `durationMinutes` int NULL DEFAULT NULL,
  `deliverables` varchar(500) NULL DEFAULT NULL,
  `deliveryDays` int NULL DEFAULT NULL,
  `imageUrl` varchar(500) NULL DEFAULT NULL,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_services' AND INDEX_NAME = 'idx_bo_media_service_company') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_services` ADD INDEX `idx_bo_media_service_company` (`companyId`,`isActive`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 2) Équipe média
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_team_members` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `roles` json NULL,
  `skills` varchar(500) NULL DEFAULT NULL,
  `dayRate` decimal(14,2) NULL DEFAULT NULL,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_team_members' AND INDEX_NAME = 'uq_bo_media_team_member') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_team_members` ADD UNIQUE INDEX `uq_bo_media_team_member` (`companyId`,`userId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 3) Projets / commandes (clients externes et demandes internes)
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_projects` (',
  '
  `id` varchar(36) NOT NULL,
  `reference` varchar(30) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `kind` enum(''EXTERNAL'',''INTERNAL'') NOT NULL DEFAULT ''EXTERNAL'',
  `clientUserId` varchar(36) NULL DEFAULT NULL,
  `clientCompanyId` varchar(36) NULL DEFAULT NULL,
  `requestingDepartment` varchar(120) NULL DEFAULT NULL,
  `clientName` varchar(150) NULL DEFAULT NULL,
  `clientPhone` varchar(50) NULL DEFAULT NULL,
  `clientEmail` varchar(150) NULL DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `description` text NULL,
  `eventType` varchar(100) NULL DEFAULT NULL,
  `eventDate` datetime(6) NULL DEFAULT NULL,
  `location` varchar(255) NULL DEFAULT NULL,
  `dueDate` date NULL DEFAULT NULL,
  `status` enum(''REQUEST'',''QUOTED'',''CONFIRMED'',''IN_PRODUCTION'',''POST_PRODUCTION'',''DELIVERED'',''COMPLETED'',''CANCELLED'') NOT NULL DEFAULT ''REQUEST'',
  `priority` enum(''LOW'',''NORMAL'',''HIGH'',''URGENT'') NOT NULL DEFAULT ''NORMAL'',
  `managerId` varchar(36) NULL DEFAULT NULL,
  `subtotal` decimal(14,2) NOT NULL DEFAULT 0,
  `discount` decimal(14,2) NOT NULL DEFAULT 0,
  `taxRate` decimal(5,2) NOT NULL DEFAULT 0,
  `total` decimal(14,2) NOT NULL DEFAULT 0,
  `amountPaid` decimal(14,2) NOT NULL DEFAULT 0,
  `paymentStatus` enum(''UNPAID'',''PARTIAL'',''PAID'',''NOT_APPLICABLE'') NOT NULL DEFAULT ''UNPAID'',
  `currency` varchar(10) NOT NULL DEFAULT ''USD'',
  `deliveryToken` varchar(64) NULL DEFAULT NULL,
  `deliveryTokenExpiresAt` datetime(6) NULL DEFAULT NULL,
  `quotedAt` datetime(6) NULL DEFAULT NULL,
  `confirmedAt` datetime(6) NULL DEFAULT NULL,
  `deliveredAt` datetime(6) NULL DEFAULT NULL,
  `completedAt` datetime(6) NULL DEFAULT NULL,
  `cancelledAt` datetime(6) NULL DEFAULT NULL,
  `cancelReason` varchar(500) NULL DEFAULT NULL,
  `notes` text NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND INDEX_NAME = 'uq_bo_media_project_reference') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_projects` ADD UNIQUE INDEX `uq_bo_media_project_reference` (`reference`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND INDEX_NAME = 'uq_bo_media_project_delivery_token') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_projects` ADD UNIQUE INDEX `uq_bo_media_project_delivery_token` (`deliveryToken`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND INDEX_NAME = 'idx_bo_media_project_company_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_projects` ADD INDEX `idx_bo_media_project_company_status` (`companyId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND INDEX_NAME = 'idx_bo_media_project_event') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_projects` ADD INDEX `idx_bo_media_project_event` (`companyId`,`eventDate`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 4) Lignes du devis
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_project_items` (',
  '
  `id` varchar(36) NOT NULL,
  `projectId` varchar(36) NOT NULL,
  `serviceId` varchar(36) NULL DEFAULT NULL,
  `label` varchar(200) NOT NULL,
  `quantity` decimal(10,2) NOT NULL DEFAULT 1,
  `unit` enum(''HOUR'',''DAY'',''SESSION'',''PROJECT'',''ITEM'',''MONTH'') NOT NULL DEFAULT ''SESSION'',
  `unitPrice` decimal(14,2) NOT NULL DEFAULT 0,
  `total` decimal(14,2) NOT NULL DEFAULT 0,
  `position` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_project_items' AND INDEX_NAME = 'idx_bo_media_item_project') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_project_items` ADD INDEX `idx_bo_media_item_project` (`projectId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 5) Planning des tournages / séances
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_sessions` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `projectId` varchar(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `type` enum(''PHOTO'',''VIDEO'',''PHOTO_VIDEO'',''DRONE'',''LIVE'',''EDITING'',''MEETING'',''OTHER'') NOT NULL DEFAULT ''PHOTO'',
  `startAt` datetime(6) NOT NULL,
  `endAt` datetime(6) NOT NULL,
  `location` varchar(255) NULL DEFAULT NULL,
  `latitude` decimal(10,7) NULL DEFAULT NULL,
  `longitude` decimal(10,7) NULL DEFAULT NULL,
  `status` enum(''PLANNED'',''IN_PROGRESS'',''DONE'',''CANCELLED'') NOT NULL DEFAULT ''PLANNED'',
  `notes` text NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_sessions' AND INDEX_NAME = 'idx_bo_media_session_company_date') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_sessions` ADD INDEX `idx_bo_media_session_company_date` (`companyId`,`startAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_sessions' AND INDEX_NAME = 'idx_bo_media_session_project') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_sessions` ADD INDEX `idx_bo_media_session_project` (`projectId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 6) Équipe affectée aux séances
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_session_crew` (',
  '
  `id` varchar(36) NOT NULL,
  `sessionId` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `role` enum(''PHOTOGRAPHER'',''VIDEOGRAPHER'',''DRONE_PILOT'',''EDITOR'',''DESIGNER'',''COMMUNITY_MANAGER'',''DIRECTOR'',''ASSISTANT'',''OTHER'') NOT NULL DEFAULT ''OTHER'',
  `note` varchar(255) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_crew' AND INDEX_NAME = 'uq_bo_media_crew') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_crew` ADD UNIQUE INDEX `uq_bo_media_crew` (`sessionId`,`userId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_crew' AND INDEX_NAME = 'idx_bo_media_crew_user') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_crew` ADD INDEX `idx_bo_media_crew_user` (`userId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 7) Matériel réservé (biens de l'entreprise)
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_session_equipment` (',
  '
  `id` varchar(36) NOT NULL,
  `sessionId` varchar(36) NOT NULL,
  `assetId` varchar(36) NOT NULL,
  `note` varchar(255) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_equipment' AND INDEX_NAME = 'uq_bo_media_equipment') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_equipment` ADD UNIQUE INDEX `uq_bo_media_equipment` (`sessionId`,`assetId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_equipment' AND INDEX_NAME = 'idx_bo_media_equipment_asset') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_equipment` ADD INDEX `idx_bo_media_equipment_asset` (`assetId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 8) Médiathèque / portfolio
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_files` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `projectId` varchar(36) NULL DEFAULT NULL,
  `sessionId` varchar(36) NULL DEFAULT NULL,
  `type` enum(''PHOTO'',''VIDEO'',''AUDIO'',''DOCUMENT'',''LINK'') NOT NULL,
  `title` varchar(200) NULL DEFAULT NULL,
  `description` varchar(500) NULL DEFAULT NULL,
  `url` varchar(1000) NOT NULL,
  `thumbnailUrl` varchar(1000) NULL DEFAULT NULL,
  `mimeType` varchar(100) NULL DEFAULT NULL,
  `sizeBytes` bigint NULL DEFAULT NULL,
  `width` int NULL DEFAULT NULL,
  `height` int NULL DEFAULT NULL,
  `duration` int NULL DEFAULT NULL,
  `isDeliverable` tinyint NOT NULL DEFAULT 0,
  `isPortfolio` tinyint NOT NULL DEFAULT 0,
  `tags` json NULL,
  `uploadedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_files' AND INDEX_NAME = 'idx_bo_media_file_company') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_files` ADD INDEX `idx_bo_media_file_company` (`companyId`,`createdAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_files' AND INDEX_NAME = 'idx_bo_media_file_project') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_files` ADD INDEX `idx_bo_media_file_project` (`projectId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_files' AND INDEX_NAME = 'idx_bo_media_file_portfolio') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_files` ADD INDEX `idx_bo_media_file_portfolio` (`companyId`,`isPortfolio`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 9) Paiements
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_payments` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `projectId` varchar(36) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT ''USD'',
  `method` enum(''CASH'',''MOBILE_MONEY'',''FPAY'',''BANK_TRANSFER'',''CARD'',''OTHER'') NOT NULL DEFAULT ''CASH'',
  `reference` varchar(100) NULL DEFAULT NULL,
  `paidAt` datetime(6) NOT NULL,
  `note` varchar(500) NULL DEFAULT NULL,
  `receivedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_payments' AND INDEX_NAME = 'idx_bo_media_payment_project') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_payments` ADD INDEX `idx_bo_media_payment_project` (`projectId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_payments' AND INDEX_NAME = 'idx_bo_media_payment_company_date') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_payments` ADD INDEX `idx_bo_media_payment_company_date` (`companyId`,`paidAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 10) Historique des projets
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_media_project_events` (',
  '
  `id` varchar(36) NOT NULL,
  `projectId` varchar(36) NOT NULL,
  `type` enum(''CREATED'',''UPDATED'',''STATUS_CHANGED'',''ITEMS_UPDATED'',''SESSION_PLANNED'',''SESSION_UPDATED'',''CREW_ASSIGNED'',''CREW_REMOVED'',''EQUIPMENT_BOOKED'',''EQUIPMENT_RELEASED'',''FILE_ADDED'',''PAYMENT'',''SHARED'',''NOTE'') NOT NULL,
  `fromStatus` varchar(30) NULL DEFAULT NULL,
  `toStatus` varchar(30) NULL DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `payload` json NULL,
  `actorId` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_project_events' AND INDEX_NAME = 'idx_bo_media_event_project_date') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_media_project_events` ADD INDEX `idx_bo_media_event_project_date` (`projectId`,`createdAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 11) Clés étrangères
--    (chaque colonne est d'abord alignée sur `table référencée`.`id` → évite l'erreur #3780)
-- ---------------------------------------------------------------------
-- bo_media_services.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_services' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_services' AND CONSTRAINT_NAME = 'fk_bo_media_service_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_services` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_services` ADD CONSTRAINT `fk_bo_media_service_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_team_members.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_team_members' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_team_members' AND CONSTRAINT_NAME = 'fk_bo_media_team_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_team_members` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_team_members` ADD CONSTRAINT `fk_bo_media_team_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_team_members.userId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_team_members' AND COLUMN_NAME = 'userId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_team_members' AND CONSTRAINT_NAME = 'fk_bo_media_team_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_team_members` MODIFY `userId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_team_members` ADD CONSTRAINT `fk_bo_media_team_user` FOREIGN KEY (`userId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_projects.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND CONSTRAINT_NAME = 'fk_bo_media_project_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_projects` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_projects` ADD CONSTRAINT `fk_bo_media_project_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_projects.clientUserId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'clientUserId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND CONSTRAINT_NAME = 'fk_bo_media_project_client' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_projects` MODIFY `clientUserId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_projects` ADD CONSTRAINT `fk_bo_media_project_client` FOREIGN KEY (`clientUserId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_projects.managerId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'managerId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND CONSTRAINT_NAME = 'fk_bo_media_project_manager' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_projects` MODIFY `managerId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_projects` ADD CONSTRAINT `fk_bo_media_project_manager` FOREIGN KEY (`managerId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_project_items.projectId → bo_media_projects.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_project_items' AND COLUMN_NAME = 'projectId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_project_items' AND CONSTRAINT_NAME = 'fk_bo_media_item_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_project_items` MODIFY `projectId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_project_items` ADD CONSTRAINT `fk_bo_media_item_project` FOREIGN KEY (`projectId`) REFERENCES `', @db, '`.`bo_media_projects` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_project_items.serviceId → bo_media_services.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_services' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_services' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_services' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_project_items' AND COLUMN_NAME = 'serviceId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_project_items' AND CONSTRAINT_NAME = 'fk_bo_media_item_service' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_project_items` MODIFY `serviceId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_project_items` ADD CONSTRAINT `fk_bo_media_item_service` FOREIGN KEY (`serviceId`) REFERENCES `', @db, '`.`bo_media_services` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_sessions.projectId → bo_media_projects.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_sessions' AND COLUMN_NAME = 'projectId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_sessions' AND CONSTRAINT_NAME = 'fk_bo_media_session_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_sessions` MODIFY `projectId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_sessions` ADD CONSTRAINT `fk_bo_media_session_project` FOREIGN KEY (`projectId`) REFERENCES `', @db, '`.`bo_media_projects` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_session_crew.sessionId → bo_media_sessions.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_sessions' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_sessions' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_sessions' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_crew' AND COLUMN_NAME = 'sessionId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_crew' AND CONSTRAINT_NAME = 'fk_bo_media_crew_session' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_crew` MODIFY `sessionId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_crew` ADD CONSTRAINT `fk_bo_media_crew_session` FOREIGN KEY (`sessionId`) REFERENCES `', @db, '`.`bo_media_sessions` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_session_crew.userId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_crew' AND COLUMN_NAME = 'userId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_crew' AND CONSTRAINT_NAME = 'fk_bo_media_crew_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_crew` MODIFY `userId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_crew` ADD CONSTRAINT `fk_bo_media_crew_user` FOREIGN KEY (`userId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_session_equipment.sessionId → bo_media_sessions.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_sessions' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_sessions' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_sessions' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_equipment' AND COLUMN_NAME = 'sessionId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_equipment' AND CONSTRAINT_NAME = 'fk_bo_media_equipment_session' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_equipment` MODIFY `sessionId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_equipment` ADD CONSTRAINT `fk_bo_media_equipment_session` FOREIGN KEY (`sessionId`) REFERENCES `', @db, '`.`bo_media_sessions` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_session_equipment.assetId → bo_assets.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_assets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_equipment' AND COLUMN_NAME = 'assetId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_session_equipment' AND CONSTRAINT_NAME = 'fk_bo_media_equipment_asset' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_equipment` MODIFY `assetId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_session_equipment` ADD CONSTRAINT `fk_bo_media_equipment_asset` FOREIGN KEY (`assetId`) REFERENCES `', @db, '`.`bo_assets` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_files.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_files' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_files' AND CONSTRAINT_NAME = 'fk_bo_media_file_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_files` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_files` ADD CONSTRAINT `fk_bo_media_file_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_files.projectId → bo_media_projects.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_files' AND COLUMN_NAME = 'projectId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_files' AND CONSTRAINT_NAME = 'fk_bo_media_file_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_files` MODIFY `projectId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_files` ADD CONSTRAINT `fk_bo_media_file_project` FOREIGN KEY (`projectId`) REFERENCES `', @db, '`.`bo_media_projects` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_files.uploadedById → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_files' AND COLUMN_NAME = 'uploadedById' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_files' AND CONSTRAINT_NAME = 'fk_bo_media_file_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_files` MODIFY `uploadedById` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_files` ADD CONSTRAINT `fk_bo_media_file_user` FOREIGN KEY (`uploadedById`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_payments.projectId → bo_media_projects.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_payments' AND COLUMN_NAME = 'projectId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_payments' AND CONSTRAINT_NAME = 'fk_bo_media_payment_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_payments` MODIFY `projectId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_payments` ADD CONSTRAINT `fk_bo_media_payment_project` FOREIGN KEY (`projectId`) REFERENCES `', @db, '`.`bo_media_projects` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_project_events.projectId → bo_media_projects.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_project_events' AND COLUMN_NAME = 'projectId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_project_events' AND CONSTRAINT_NAME = 'fk_bo_media_event_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_project_events` MODIFY `projectId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_project_events` ADD CONSTRAINT `fk_bo_media_event_project` FOREIGN KEY (`projectId`) REFERENCES `', @db, '`.`bo_media_projects` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_media_project_events.actorId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_project_events' AND COLUMN_NAME = 'actorId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_media_project_events' AND CONSTRAINT_NAME = 'fk_bo_media_event_actor' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_project_events` MODIFY `actorId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_media_project_events` ADD CONSTRAINT `fk_bo_media_event_actor` FOREIGN KEY (`actorId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET FOREIGN_KEY_CHECKS = @OLD_FK;

-- Vérification : doit lister les 10 tables du module Média
SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('bo_media_services','bo_media_team_members','bo_media_projects','bo_media_project_items','bo_media_sessions','bo_media_session_crew','bo_media_session_equipment','bo_media_files','bo_media_payments','bo_media_project_events')
 ORDER BY TABLE_NAME;
