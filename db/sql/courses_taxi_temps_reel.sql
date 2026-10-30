-- =====================================================================
-- Courses taxi (type Bolt) — MySQL 8 — SANS procédure stockée.
-- ⚠️ 1) Sélectionnez D'ABORD votre base de l'application dans phpMyAdmin
--       (clic sur son nom à gauche), PAS « information_schema ».
-- ⚠️ 2) Collez et exécutez le fichier EN ENTIER, en une seule fois.
-- Idempotent : peut être relancé. Aucune donnée existante n'est modifiée.
-- =====================================================================

-- Contrôle : affiche la base utilisée (doit être celle de l'application)
SELECT DATABASE() AS base_utilisee;

-- ---------------------------------------------------------------------
-- 1) rides : nouvelles colonnes
-- ---------------------------------------------------------------------
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'vehicleId') = 0,
  'ALTER TABLE `rides` ADD COLUMN `vehicleId` varchar(36) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paymentMethod') = 0,
  'ALTER TABLE `rides` ADD COLUMN `paymentMethod` varchar(20) NULL DEFAULT ''CASH''', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'currency') = 0,
  'ALTER TABLE `rides` ADD COLUMN `currency` varchar(10) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'finalPrice') = 0,
  'ALTER TABLE `rides` ADD COLUMN `finalPrice` decimal(10,2) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'commissionAmount') = 0,
  'ALTER TABLE `rides` ADD COLUMN `commissionAmount` decimal(10,2) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'driverEarning') = 0,
  'ALTER TABLE `rides` ADD COLUMN `driverEarning` decimal(10,2) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'dispatchRound') = 0,
  'ALTER TABLE `rides` ADD COLUMN `dispatchRound` int NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'lastDispatchAt') = 0,
  'ALTER TABLE `rides` ADD COLUMN `lastDispatchAt` datetime(6) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'notifiedDriverIds') = 0,
  'ALTER TABLE `rides` ADD COLUMN `notifiedDriverIds` json NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'rejectedDriverIds') = 0,
  'ALTER TABLE `rides` ADD COLUMN `rejectedDriverIds` json NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'acceptedAt') = 0,
  'ALTER TABLE `rides` ADD COLUMN `acceptedAt` datetime(6) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'arrivedAt') = 0,
  'ALTER TABLE `rides` ADD COLUMN `arrivedAt` datetime(6) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'startedAt') = 0,
  'ALTER TABLE `rides` ADD COLUMN `startedAt` datetime(6) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'completedAt') = 0,
  'ALTER TABLE `rides` ADD COLUMN `completedAt` datetime(6) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'cancelledAt') = 0,
  'ALTER TABLE `rides` ADD COLUMN `cancelledAt` datetime(6) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'driverRating') = 0,
  'ALTER TABLE `rides` ADD COLUMN `driverRating` tinyint NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'driverRatingComment') = 0,
  'ALTER TABLE `rides` ADD COLUMN `driverRatingComment` varchar(500) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'riderRating') = 0,
  'ALTER TABLE `rides` ADD COLUMN `riderRating` tinyint NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'riderRatingComment') = 0,
  'ALTER TABLE `rides` ADD COLUMN `riderRatingComment` varchar(500) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 2) Index (recherche des chauffeurs proches, courses en cours)
-- ---------------------------------------------------------------------
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_status_dispatch') = 0
  AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides') = 1,
  'ALTER TABLE `rides` ADD INDEX `idx_rides_status_dispatch` (`status`,`lastDispatchAt`)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_driver_status') = 0
  AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides') = 1,
  'ALTER TABLE `rides` ADD INDEX `idx_rides_driver_status` (`driverId`,`status`)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_rider_status') = 0
  AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides') = 1,
  'ALTER TABLE `rides` ADD INDEX `idx_rides_rider_status` (`riderId`,`status`)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_locations' AND INDEX_NAME = 'idx_driver_locations_dispatch') = 0
  AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_locations') = 1,
  'ALTER TABLE `driver_locations` ADD INDEX `idx_driver_locations_dispatch` (`isOnline`,`isBusy`,`updatedAt`)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_vehicles' AND INDEX_NAME = 'idx_driver_vehicles_active_cat') = 0
  AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_vehicles') = 1,
  'ALTER TABLE `driver_vehicles` ADD INDEX `idx_driver_vehicles_active_cat` (`driverId`,`isActive`,`categoryId`)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 3) ride_events : historique complet de chaque course
--    (même jeu de caractères / collation que la table rides)
-- ---------------------------------------------------------------------
SET @coll = (SELECT TABLE_COLLATION FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' LIMIT 1);
SET @coll = COALESCE(@coll, 'utf8mb4_unicode_ci');
SET @cs = COALESCE((SELECT CHARACTER_SET_NAME FROM information_schema.COLLATIONS
                     WHERE COLLATION_NAME = @coll LIMIT 1), 'utf8mb4');

SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `ride_events` (',
  '`id` varchar(36) NOT NULL,',
  '`rideId` varchar(36) NOT NULL,',
  '`type` varchar(40) NOT NULL,',
  '`fromStatus` varchar(30) NULL DEFAULT NULL,',
  '`toStatus` varchar(30) NULL DEFAULT NULL,',
  '`actorId` varchar(36) NULL DEFAULT NULL,',
  '`actorRole` varchar(10) NULL DEFAULT NULL,',
  '`lat` decimal(10,7) NULL DEFAULT NULL,',
  '`lng` decimal(10,7) NULL DEFAULT NULL,',
  '`payload` json NULL,',
  '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
  'PRIMARY KEY (`id`),',
  'INDEX `idx_ride_events_ride_date` (`rideId`, `createdAt`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Aligner ride_events.rideId sur rides.id (type + collation) → évite l'erreur #3780
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'id' LIMIT 1);
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_events'
                     AND CONSTRAINT_NAME = 'fk_ride_events_ride' AND CONSTRAINT_TYPE = 'FOREIGN KEY');

SET @s = IF(@fk_exists = 0 AND @ref_type IS NOT NULL,
  CONCAT('ALTER TABLE `ride_events` MODIFY `rideId` ', @ref_type,
         IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), ' NOT NULL'),
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF(@fk_exists = 0 AND @ref_type IS NOT NULL,
  'ALTER TABLE `ride_events` ADD CONSTRAINT `fk_ride_events_ride` FOREIGN KEY (`rideId`) REFERENCES `rides` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- Vérification
-- ---------------------------------------------------------------------
SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides'
   AND COLUMN_NAME IN ('vehicleId','paymentMethod','finalPrice','dispatchRound','notifiedDriverIds','acceptedAt','driverRating');
SELECT COUNT(*) AS table_ride_events FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_events';
