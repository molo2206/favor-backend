-- =====================================================================
-- Courses taxi : commission des courses en espèces + tableau de bord admin
--  1) Table driver_wallet_movements : commission d'une course en espèces débitée des gains du chauffeur
--     (une ligne par course, index unique → jamais deux débits) + suivi du crédit du compte F-Pay TAXI
--  2) Index rides.createdAt : filtre par période du tableau de bord
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- Aucune donnée existante n'est modifiée ni supprimée. Les anciennes courses en espèces ne sont PAS débitées.
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- Migration équivalente : db/migrations/1794614400000-DriverWalletMovements.ts
-- =====================================================================

SET @db = 'favor_db';
-- (Mettez ici le nom de VOTRE base si ce n'est pas favor_db)

-- ⚠️ Contrôle : doit afficher 1 (0 = table rides introuvable dans cette base → arrêtez)
SELECT COUNT(*) AS rides_trouvee FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides';

-- 1) Table driver_wallet_movements
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`driver_wallet_movements` (',
  '`id` varchar(36) NOT NULL,',
  '`driverId` varchar(36) NOT NULL,',
  '`currency` varchar(10) NOT NULL,',
  '`type` varchar(30) NOT NULL,',
  '`amount` decimal(14,2) NOT NULL,',
  '`rideId` varchar(36) NULL DEFAULT NULL,',
  '`description` varchar(255) NULL DEFAULT NULL,',
  '`taxiCreditStatus` varchar(20) NOT NULL DEFAULT ''PENDING'',',
  '`taxiTransactionId` varchar(100) NULL DEFAULT NULL,',
  '`taxiReference` varchar(100) NULL DEFAULT NULL,',
  '`taxiCreditError` varchar(500) NULL DEFAULT NULL,',
  '`taxiCreditAttempts` int NOT NULL DEFAULT 0,',
  '`taxiCreditedAt` datetime(6) NULL DEFAULT NULL,',
  '`createdById` varchar(36) NULL DEFAULT NULL,',
  '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
  '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),',
  'PRIMARY KEY (`id`),',
  'UNIQUE KEY `uq_driver_wallet_movement_ride_type` (`rideId`, `type`),',
  'KEY `idx_driver_wallet_movement_driver` (`driverId`, `currency`),',
  'KEY `idx_driver_wallet_movement_credit` (`taxiCreditStatus`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Index rides.createdAt
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'createdAt' AND SEQ_IN_INDEX = 1) = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD INDEX `idx_rides_created_at` (`createdAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Vérification
SELECT TABLE_NAME AS table_creee FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'driver_wallet_movements';
SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'createdAt';
