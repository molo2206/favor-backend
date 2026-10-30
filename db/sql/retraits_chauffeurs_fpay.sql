-- =====================================================================
-- MISE À JOUR — Retrait des gains des chauffeurs via F-Pay (route taxi/driver/cashout)
--   • driver_cashouts : chaque demande de retrait (montant, devise, Mobile Money, statut, références F-Pay)
--   • index unique (driverId, requestId) : la même clé d'idempotence ne crée jamais un 2e retrait
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ✅ Base détectée automatiquement (celle qui contient `rides`).
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'rides'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

SELECT @db AS base_modifiee;

SET @coll = COALESCE((SELECT TABLE_COLLATION FROM information_schema.TABLES
                       WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' LIMIT 1), 'utf8mb4_unicode_ci');
SET @cs = COALESCE((SELECT CHARACTER_SET_NAME FROM information_schema.COLLATIONS
                     WHERE COLLATION_NAME = @coll LIMIT 1), 'utf8mb4');

-- Type exact de users.id (clé étrangère)
SET @u_type = COALESCE((SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @u_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @u_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @user_col = CONCAT(@u_type, IF(@u_cs IS NULL, '', CONCAT(' CHARACTER SET ', @u_cs, ' COLLATE ', @u_coll)));

-- 1) Table des retraits
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`driver_cashouts` (',
  '`id` varchar(36) NOT NULL, ',
  '`reference` varchar(40) NOT NULL, ',
  '`driverId` ', @user_col, ' NOT NULL, ',
  '`requestId` varchar(80) NULL DEFAULT NULL, ',
  '`amount` decimal(14,2) NOT NULL, ',
  '`currency` varchar(10) NOT NULL, ',
  '`balanceBefore` decimal(14,2) NULL DEFAULT NULL, ',
  '`paymentMethodId` varchar(36) NULL DEFAULT NULL, ',
  '`provider` varchar(60) NOT NULL, ',
  '`phone` varchar(30) NOT NULL, ',
  '`walletId` varchar(64) NULL DEFAULT NULL, ',
  '`status` varchar(20) NOT NULL DEFAULT ''PROCESSING'', ',
  '`fpayTransactionId` varchar(100) NULL DEFAULT NULL, ',
  '`fpayReference` varchar(100) NULL DEFAULT NULL, ',
  '`fpayExternalReference` varchar(100) NULL DEFAULT NULL, ',
  '`fpayStatus` varchar(30) NULL DEFAULT NULL, ',
  '`fpayCurrency` varchar(10) NULL DEFAULT NULL, ',
  '`fpayMessage` varchar(500) NULL DEFAULT NULL, ',
  '`fpayResponse` json NULL, ',
  '`failureReason` varchar(500) NULL DEFAULT NULL, ',
  '`completedAt` datetime(6) NULL DEFAULT NULL, ',
  '`resolvedById` varchar(36) NULL DEFAULT NULL, ',
  '`resolutionNote` varchar(500) NULL DEFAULT NULL, ',
  '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ',
  '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ',
  'PRIMARY KEY (`id`), ',
  'UNIQUE KEY `uq_driver_cashout_reference` (`reference`), ',
  'UNIQUE KEY `uq_driver_cashout_request` (`driverId`, `requestId`), ',
  'KEY `idx_driver_cashout_driver` (`driverId`, `createdAt`), ',
  'KEY `idx_driver_cashout_status` (`status`, `createdAt`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Clé étrangère vers users
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'driver_cashouts' AND CONSTRAINT_NAME = 'fk_driver_cashout_driver') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`driver_cashouts` ADD CONSTRAINT `fk_driver_cashout_driver` FOREIGN KEY (`driverId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'),
  'SELECT ''fk_driver_cashout_driver : déjà en place'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3) Index utile au calcul du solde (courses terminées et payées d'un chauffeur)
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_driver_earnings') = 0,
  CONCAT('CREATE INDEX `idx_rides_driver_earnings` ON `', @db, '`.`rides` (`driverId`, `status`, `paymentStatus`)'),
  'SELECT ''idx_rides_driver_earnings : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'OK — retraits des chauffeurs via F-Pay prêts' AS resultat;
