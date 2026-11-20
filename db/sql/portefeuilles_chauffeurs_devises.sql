-- =====================================================================
-- MISE À JOUR — Devise des courses + portefeuilles chauffeur PAR DEVISE + retrait vers le compte F-Pay
--   1) rides.currency : les anciennes courses sans devise reçoivent la devise du tarif de leur ville (sinon USD)
--   2) driver_wallets : un portefeuille par chauffeur ET par devise (USD, CDF…), créé automatiquement par les courses
--   3) driver_cashouts : destination (FPAY), compte F-Pay crédité, portefeuille débité
--      driver_wallets.fpayWalletId : wallet F-Pay du chauffeur dans la devise (suivi, facultatif)
--   4) portefeuilles créés pour les courses déjà attribuées
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

-- Devise par défaut quand la ville n'a pas de tarif (même valeur que RIDE_PRICING_CURRENCY du .env)
SET @default_currency = 'USD';

SET @coll = COALESCE((SELECT TABLE_COLLATION FROM information_schema.TABLES
                       WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' LIMIT 1), 'utf8mb4_unicode_ci');
SET @cs = COALESCE((SELECT CHARACTER_SET_NAME FROM information_schema.COLLATIONS
                     WHERE COLLATION_NAME = @coll LIMIT 1), 'utf8mb4');

-- Type exact de users.id (clé étrangère)
SET @u_type = COALESCE((SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @u_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @u_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @user_col = CONCAT(@u_type, IF(@u_cs IS NULL, '', CONCAT(' CHARACTER SET ', @u_cs, ' COLLATE ', @u_coll)));

-- ---------------------------------------------------------------------
-- 1) Devise des anciennes courses (devise du tarif de la ville, sinon @default_currency)
-- ---------------------------------------------------------------------
SET @has_cities = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'tarif');
SET @s = IF(@has_cities > 0,
  CONCAT('UPDATE `', @db, '`.`rides` r LEFT JOIN `', @db, '`.`cities` c ON c.id = r.cityId ',
         'SET r.currency = UPPER(COALESCE(NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.tarif, ''$.currency'')), ''null''), ''''), ''', @default_currency, ''')) ',
         'WHERE r.currency IS NULL OR r.currency = ''''' ),
  CONCAT('UPDATE `', @db, '`.`rides` SET currency = ''', @default_currency, ''' WHERE currency IS NULL OR currency = '''''));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Devises en majuscules partout (usd → USD)
SET @s = CONCAT('UPDATE `', @db, '`.`rides` SET currency = UPPER(TRIM(currency)) WHERE currency <> UPPER(TRIM(currency))');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 2) Portefeuilles chauffeur par devise
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`driver_wallets` (',
  '`id` varchar(36) NOT NULL, ',
  '`driverId` ', @user_col, ' NOT NULL, ',
  '`currency` varchar(10) NOT NULL, ',
  '`status` varchar(20) NOT NULL DEFAULT ''ACTIVE'', ',
  '`earned` decimal(14,2) NOT NULL DEFAULT 0, ',
  '`withdrawn` decimal(14,2) NOT NULL DEFAULT 0, ',
  '`available` decimal(14,2) NOT NULL DEFAULT 0, ',
  '`ridesCount` int NOT NULL DEFAULT 0, ',
  '`fpayWalletId` varchar(64) NULL DEFAULT NULL, ',
  '`firstRideId` varchar(36) NULL DEFAULT NULL, ',
  '`lastSyncedAt` datetime(6) NULL DEFAULT NULL, ',
  '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ',
  '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ',
  'PRIMARY KEY (`id`), ',
  'UNIQUE KEY `uq_driver_wallet_currency` (`driverId`, `currency`), ',
  'CONSTRAINT `fk_driver_wallet_driver` FOREIGN KEY (`driverId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Wallet F-Pay du chauffeur dans la devise (suivi ; F-Pay le retrouve grâce à userId + devise)
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'driver_wallets' AND COLUMN_NAME = 'fpayWalletId');
SET @s = IF(@c = 0, CONCAT('ALTER TABLE `', @db, '`.`driver_wallets` ADD COLUMN `fpayWalletId` varchar(64) NULL DEFAULT NULL AFTER `ridesCount`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 3) Retraits : destination (FPAY), compte F-Pay crédité, portefeuille débité
-- ---------------------------------------------------------------------
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'driver_cashouts' AND COLUMN_NAME = 'destination');
SET @s = IF(@c = 0, CONCAT('ALTER TABLE `', @db, '`.`driver_cashouts` ADD COLUMN `destination` varchar(20) NOT NULL DEFAULT ''MOBILE_MONEY'' AFTER `paymentMethodId`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'driver_cashouts' AND COLUMN_NAME = 'fpayAccountId');
SET @s = IF(@c = 0, CONCAT('ALTER TABLE `', @db, '`.`driver_cashouts` ADD COLUMN `fpayAccountId` varchar(64) NULL DEFAULT NULL AFTER `phone`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'driver_cashouts' AND COLUMN_NAME = 'driverWalletId');
SET @s = IF(@c = 0, CONCAT('ALTER TABLE `', @db, '`.`driver_cashouts` ADD COLUMN `driverWalletId` varchar(36) NULL DEFAULT NULL AFTER `fpayAccountId`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 4) Portefeuilles pour les courses déjà attribuées (une ligne par chauffeur et par devise)
-- ---------------------------------------------------------------------
SET @s = CONCAT('INSERT IGNORE INTO `', @db, '`.`driver_wallets` (id, driverId, currency, status, earned, withdrawn, available, ridesCount, firstRideId) ',
  'SELECT UUID(), r.driverId, UPPER(r.currency), ''ACTIVE'', 0, 0, 0, SUM(r.status = ''COMPLETED''), MIN(r.id) ',
  'FROM `', @db, '`.`rides` r WHERE r.driverId IS NOT NULL AND r.currency IS NOT NULL AND r.currency <> '''' ',
  'GROUP BY r.driverId, UPPER(r.currency)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Portefeuilles des devises déjà retirées (retraits existants)
SET @s = CONCAT('INSERT IGNORE INTO `', @db, '`.`driver_wallets` (id, driverId, currency, status) ',
  'SELECT UUID(), c.driverId, UPPER(c.currency), ''ACTIVE'' FROM `', @db, '`.`driver_cashouts` c GROUP BY c.driverId, UPPER(c.currency)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Contrôle
SET @s = CONCAT('SELECT currency, COUNT(*) AS portefeuilles FROM `', @db, '`.`driver_wallets` GROUP BY currency');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = CONCAT('SELECT COUNT(*) AS courses_sans_devise FROM `', @db, '`.`rides` WHERE currency IS NULL OR currency = ''''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
