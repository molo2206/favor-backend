-- =====================================================================
-- MISE À JOUR — Chauffeurs PRIVÉS ou MEMBRES d'une association
--   • driver_associations : associations de chauffeurs (part % sur chaque course d'un membre)
--   • driver_profiles     : statut de chaque chauffeur (PRIVATE / ASSOCIATION) — sans ligne = privé
--   • rides               : association figée à l'acceptation, part (%) et montant de l'association
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ✅ Base détectée automatiquement (celle qui contient `company`).
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
                       WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' LIMIT 1), 'utf8mb4_unicode_ci');
SET @cs = COALESCE((SELECT CHARACTER_SET_NAME FROM information_schema.COLLATIONS
                     WHERE COLLATION_NAME = @coll LIMIT 1), 'utf8mb4');

-- Types exacts des clés référencées (users.id, cities.id)
SET @u_type = COALESCE((SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @u_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @u_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @user_col = CONCAT(@u_type, IF(@u_cs IS NULL, '', CONCAT(' CHARACTER SET ', @u_cs, ' COLLATE ', @u_coll)));
SET @c_type = COALESCE((SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @c_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'id' LIMIT 1);
SET @c_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'id' LIMIT 1);
SET @city_col = CONCAT(@c_type, IF(@c_cs IS NULL, '', CONCAT(' CHARACTER SET ', @c_cs, ' COLLATE ', @c_coll)));

-- 1) Associations
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`driver_associations` (',
  '`id` varchar(36) NOT NULL, ',
  '`name` varchar(150) NOT NULL, ',
  '`code` varchar(30) NULL DEFAULT NULL, ',
  '`cityId` ', @city_col, ' NULL DEFAULT NULL, ',
  '`managerName` varchar(150) NULL DEFAULT NULL, ',
  '`phone` varchar(30) NULL DEFAULT NULL, ',
  '`email` varchar(150) NULL DEFAULT NULL, ',
  '`address` varchar(255) NULL DEFAULT NULL, ',
  '`logoUrl` varchar(500) NULL DEFAULT NULL, ',
  '`description` text NULL, ',
  '`commissionRate` decimal(5,2) NOT NULL DEFAULT 0, ',
  '`isActive` tinyint NOT NULL DEFAULT 1, ',
  '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ',
  '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ',
  'PRIMARY KEY (`id`), ',
  'UNIQUE KEY `uq_driver_assoc_name` (`name`), ',
  'UNIQUE KEY `uq_driver_assoc_code` (`code`), ',
  'KEY `idx_driver_assoc_city` (`cityId`, `isActive`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Statut des chauffeurs
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`driver_profiles` (',
  '`id` varchar(36) NOT NULL, ',
  '`driverId` ', @user_col, ' NOT NULL, ',
  '`type` enum(''PRIVATE'',''ASSOCIATION'') NOT NULL DEFAULT ''PRIVATE'', ',
  '`associationId` varchar(36) NULL DEFAULT NULL, ',
  '`memberNumber` varchar(50) NULL DEFAULT NULL, ',
  '`joinedAt` datetime(6) NULL DEFAULT NULL, ',
  '`note` varchar(500) NULL DEFAULT NULL, ',
  '`updatedById` varchar(36) NULL DEFAULT NULL, ',
  '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ',
  '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ',
  'PRIMARY KEY (`id`), ',
  'UNIQUE KEY `uq_driver_profile_driver` (`driverId`), ',
  'KEY `idx_driver_profile_assoc` (`associationId`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3) Clés étrangères
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'driver_associations' AND CONSTRAINT_NAME = 'fk_driver_assoc_city') = 0
            AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cities') = 1,
  CONCAT('ALTER TABLE `', @db, '`.`driver_associations` ADD CONSTRAINT `fk_driver_assoc_city` FOREIGN KEY (`cityId`) REFERENCES `', @db, '`.`cities` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'),
  'SELECT ''fk_driver_assoc_city : déjà en place'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'driver_profiles' AND CONSTRAINT_NAME = 'fk_driver_profile_driver') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`driver_profiles` ADD CONSTRAINT `fk_driver_profile_driver` FOREIGN KEY (`driverId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'),
  'SELECT ''fk_driver_profile_driver : déjà en place'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'driver_profiles' AND CONSTRAINT_NAME = 'fk_driver_profile_assoc') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`driver_profiles` ADD CONSTRAINT `fk_driver_profile_assoc` FOREIGN KEY (`associationId`) REFERENCES `', @db, '`.`driver_associations` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'),
  'SELECT ''fk_driver_profile_assoc : déjà en place'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 4) Courses : association et part
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'associationId') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `associationId` varchar(36) NULL DEFAULT NULL'),
  'SELECT ''rides.associationId : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'associationCommissionRate') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `associationCommissionRate` decimal(5,2) NULL DEFAULT NULL'),
  'SELECT ''rides.associationCommissionRate : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'associationCommissionAmount') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `associationCommissionAmount` decimal(10,2) NULL DEFAULT NULL'),
  'SELECT ''rides.associationCommissionAmount : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_association') = 0,
  CONCAT('CREATE INDEX `idx_rides_association` ON `', @db, '`.`rides` (`associationId`, `completedAt`)'),
  'SELECT ''idx_rides_association : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'OK — chauffeurs privés / associations prêts' AS resultat;
