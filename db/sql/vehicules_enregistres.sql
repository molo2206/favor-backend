-- =====================================================================
-- Enregistrement des véhicules (vente / location) avec propriétaire et commissionnaire
-- Table : vehicle_registrations
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- Ne modifie AUCUNE table existante (seulement la nouvelle table).
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- Migration équivalente : db/migrations/1794355200000-VehicleRegistrations.ts
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
-- 1) vehicle_registrations : Véhicules enregistrés (+ propriétaire, commissionnaire, images)
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`vehicle_registrations` (',
  '
  `id` varchar(36) NOT NULL,
  `reference` varchar(30) NOT NULL,
  `name` varchar(150) NOT NULL,
  `brand` varchar(100) NOT NULL,
  `year` int NULL DEFAULT NULL,
  `color` varchar(50) NULL DEFAULT NULL,
  `transmission` enum(''MANUAL'',''AUTOMATIC'',''SEMI_AUTOMATIQUE'') NULL DEFAULT NULL,
  `mileage` int NULL DEFAULT NULL,
  `plateNumber` varchar(30) NULL DEFAULT NULL,
  `engineCondition` enum(''EXCELLENT'',''GOOD'',''AVERAGE'',''NEEDS_REPAIR'',''NOT_WORKING'') NULL DEFAULT NULL,
  `originality` enum(''ORIGINAL'',''MODIFIED'',''ACCIDENTED'',''MODIFIED_AND_ACCIDENTED'') NULL DEFAULT NULL,
  `availableDocuments` json NULL,
  `locationAddress` varchar(255) NULL DEFAULT NULL,
  `city` varchar(100) NULL DEFAULT NULL,
  `latitude` decimal(10,7) NULL DEFAULT NULL,
  `longitude` decimal(10,7) NULL DEFAULT NULL,
  `registrationType` enum(''SALE'',''RENTAL'') NOT NULL,
  `priceMin` decimal(14,2) NOT NULL,
  `priceMax` decimal(14,2) NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT ''USD'',
  `ownerName` varchar(150) NOT NULL,
  `ownerAddress` varchar(255) NULL DEFAULT NULL,
  `ownerPhone` varchar(30) NOT NULL,
  `brokerName` varchar(150) NULL DEFAULT NULL,
  `brokerPhone` varchar(30) NULL DEFAULT NULL,
  `brokerAmount` decimal(14,2) NULL DEFAULT NULL,
  `images` json NULL,
  `status` enum(''AVAILABLE'',''RESERVED'',''SOLD'',''RENTED'',''WITHDRAWN'') NOT NULL DEFAULT ''AVAILABLE'',
  `notes` text NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `updatedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deletedAt` datetime(6) NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vehicle_registrations' AND INDEX_NAME = 'uq_vr_reference') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`vehicle_registrations` ADD UNIQUE INDEX `uq_vr_reference` (`reference`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vehicle_registrations' AND INDEX_NAME = 'idx_vr_type_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`vehicle_registrations` ADD INDEX `idx_vr_type_status` (`registrationType`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vehicle_registrations' AND INDEX_NAME = 'idx_vr_plate') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`vehicle_registrations` ADD INDEX `idx_vr_plate` (`plateNumber`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vehicle_registrations' AND INDEX_NAME = 'idx_vr_owner_phone') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`vehicle_registrations` ADD INDEX `idx_vr_owner_phone` (`ownerPhone`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vehicle_registrations' AND INDEX_NAME = 'idx_vr_broker_phone') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`vehicle_registrations` ADD INDEX `idx_vr_broker_phone` (`brokerPhone`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vehicle_registrations' AND INDEX_NAME = 'idx_vr_created_by') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`vehicle_registrations` ADD INDEX `idx_vr_created_by` (`createdById`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 1 bis) Mise à niveau : originalité = modifié / accidenté / ni l'un ni l'autre
--        (seulement si la table a déjà été créée avec l'ancienne liste ORIGINAL / PARTIALLY_ORIGINAL / NOT_ORIGINAL ;
--         les anciennes valeurs PARTIALLY_ORIGINAL et NOT_ORIGINAL sont vidées : à ressaisir)
-- ---------------------------------------------------------------------
SET @old_enum = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vehicle_registrations'
                  AND COLUMN_NAME = 'originality' AND COLUMN_TYPE LIKE '%PARTIALLY_ORIGINAL%');
SET @s = IF(@old_enum > 0, CONCAT('ALTER TABLE `', @db, '`.`vehicle_registrations` MODIFY `originality` enum(''ORIGINAL'',''PARTIALLY_ORIGINAL'',''NOT_ORIGINAL'',''MODIFIED'',''ACCIDENTED'',''MODIFIED_AND_ACCIDENTED'') NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@old_enum > 0, CONCAT('UPDATE `', @db, '`.`vehicle_registrations` SET `originality` = NULL WHERE `originality` IN (''PARTIALLY_ORIGINAL'',''NOT_ORIGINAL'')'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@old_enum > 0, CONCAT('ALTER TABLE `', @db, '`.`vehicle_registrations` MODIFY `originality` enum(''ORIGINAL'',''MODIFIED'',''ACCIDENTED'',''MODIFIED_AND_ACCIDENTED'') NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 2) Clé étrangère
--    (chaque colonne est d'abord alignée sur `table référencée`.`id` → évite l'erreur #3780)
-- ---------------------------------------------------------------------
-- vehicle_registrations.createdById → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'vehicle_registrations' AND COLUMN_NAME = 'createdById' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'vehicle_registrations' AND CONSTRAINT_NAME = 'fk_vr_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`vehicle_registrations` MODIFY `createdById` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`vehicle_registrations` ADD CONSTRAINT `fk_vr_created_by` FOREIGN KEY (`createdById`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET FOREIGN_KEY_CHECKS = @OLD_FK;

-- ---------------------------------------------------------------------
-- Vérification : doit afficher la table
-- ---------------------------------------------------------------------
SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('vehicle_registrations')
 ORDER BY TABLE_NAME;
