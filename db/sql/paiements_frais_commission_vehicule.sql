-- =====================================================================
-- MISE À JOUR — Paiements : commission par véhicule, paiement des courses, frais des annonces
--   (les frais de transaction et la devise sont envoyés par le front, comme pour les commandes)
--   • driver_vehicles.commissionRate : commission de la plateforme PAR VÉHICULE
--     (reprise de l'ancienne commission du tarif de la catégorie, une seule fois)
--   • pricings.commissionRate : n'est plus utilisée → rendue facultative (NULL)
--   • rides : commission figée, frais de transaction (du front), total à payer, état du paiement
--     (les courses déjà terminées sont marquées PAYÉES, une seule fois)
--   • classified_payments : frais de transaction (du front) + montant total payé
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

-- 0) État avant la mise à jour (les reprises de données ne s'exécutent qu'une fois)
SET @had_driver_vehicles_commissionRate = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'driver_vehicles' AND COLUMN_NAME = 'commissionRate');
SET @had_rides_paymentStatus = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paymentStatus');
SET @had_classified_payments_totalAmount = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND COLUMN_NAME = 'totalAmount');

-- 1) Nouvelles colonnes
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'driver_vehicles') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'driver_vehicles' AND COLUMN_NAME = 'commissionRate') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`driver_vehicles` ADD COLUMN `commissionRate` decimal(5,2) NULL DEFAULT NULL'),
  'SELECT ''driver_vehicles.commissionRate : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'commissionRate') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `commissionRate` decimal(5,2) NULL DEFAULT NULL'),
  'SELECT ''rides.commissionRate : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'transactionFee') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `transactionFee` decimal(10,2) NULL DEFAULT NULL'),
  'SELECT ''rides.transactionFee : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'transactionFeeRate') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `transactionFeeRate` decimal(5,2) NULL DEFAULT NULL'),
  'SELECT ''rides.transactionFeeRate : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'totalToPay') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `totalToPay` decimal(10,2) NULL DEFAULT NULL'),
  'SELECT ''rides.totalToPay : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paymentStatus') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `paymentStatus` varchar(20) NOT NULL DEFAULT ''PENDING'''),
  'SELECT ''rides.paymentStatus : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paymentProvider') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `paymentProvider` varchar(60) NULL DEFAULT NULL'),
  'SELECT ''rides.paymentProvider : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paymentPhone') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `paymentPhone` varchar(30) NULL DEFAULT NULL'),
  'SELECT ''rides.paymentPhone : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paymentExternalId') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `paymentExternalId` varchar(100) NULL DEFAULT NULL'),
  'SELECT ''rides.paymentExternalId : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paymentTransactionId') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `paymentTransactionId` varchar(100) NULL DEFAULT NULL'),
  'SELECT ''rides.paymentTransactionId : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paymentReference') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `paymentReference` varchar(100) NULL DEFAULT NULL'),
  'SELECT ''rides.paymentReference : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paymentFailureReason') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `paymentFailureReason` varchar(500) NULL DEFAULT NULL'),
  'SELECT ''rides.paymentFailureReason : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paymentStartedAt') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `paymentStartedAt` datetime(6) NULL DEFAULT NULL'),
  'SELECT ''rides.paymentStartedAt : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paidAt') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `paidAt` datetime(6) NULL DEFAULT NULL'),
  'SELECT ''rides.paidAt : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'paymentConfirmedById') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`rides` ADD COLUMN `paymentConfirmedById` varchar(36) NULL DEFAULT NULL'),
  'SELECT ''rides.paymentConfirmedById : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND COLUMN_NAME = 'transactionFee') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_payments` ADD COLUMN `transactionFee` decimal(14,2) NOT NULL DEFAULT 0'),
  'SELECT ''classified_payments.transactionFee : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND COLUMN_NAME = 'transactionFeeRate') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_payments` ADD COLUMN `transactionFeeRate` decimal(5,2) NOT NULL DEFAULT 0'),
  'SELECT ''classified_payments.transactionFeeRate : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments') = 1
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND COLUMN_NAME = 'totalAmount') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_payments` ADD COLUMN `totalAmount` decimal(14,2) NULL DEFAULT NULL'),
  'SELECT ''classified_payments.totalAmount : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Index
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_payment_status') = 0,
  CONCAT('CREATE INDEX `idx_rides_payment_status` ON `', @db, '`.`rides` (`paymentStatus`, `paymentStartedAt`)'),
  'SELECT ''index idx_rides_payment_status : existe déjà'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 3) pricings.commissionRate : plus utilisée (commission par véhicule) → facultative
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'pricings' AND COLUMN_NAME = 'commissionRate' AND IS_NULLABLE = 'NO') = 1,
  CONCAT('ALTER TABLE `', @db, '`.`pricings` MODIFY COLUMN `commissionRate` decimal(5,2) NULL DEFAULT NULL'),
  'SELECT ''pricings.commissionRate : rien à faire'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 4) Reprise des données (une seule fois : seulement si la colonne vient d'être créée)
SET @sql = IF(
  @had_driver_vehicles_commissionRate = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'pricings' AND COLUMN_NAME = 'commissionRate') = 1,
  CONCAT('UPDATE `', @db, '`.`driver_vehicles` v SET v.`commissionRate` = (SELECT MAX(p.`commissionRate`) FROM `', @db, '`.`pricings` p WHERE p.`categoryId` = v.`categoryId` AND p.`commissionRate` IS NOT NULL) WHERE v.`commissionRate` IS NULL'),
  'SELECT ''reprise driver_vehicles.commissionRate : déjà faite'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  @had_rides_paymentStatus = 0,
  CONCAT('UPDATE `', @db, '`.`rides` SET `paymentStatus` = ''PAID'', `paidAt` = COALESCE(`paidAt`, `completedAt`, `updatedAt`), `totalToPay` = COALESCE(`totalToPay`, `finalPrice`, `price`), `transactionFee` = COALESCE(`transactionFee`, 0) WHERE `status` = ''COMPLETED'''),
  'SELECT ''reprise rides.paymentStatus : déjà faite'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  @had_classified_payments_totalAmount = 0,
  CONCAT('UPDATE `', @db, '`.`classified_payments` SET `totalAmount` = `amount` + `transactionFee` WHERE `totalAmount` IS NULL'),
  'SELECT ''reprise classified_payments.totalAmount : déjà faite'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'OK — commission par véhicule, paiement des courses et frais des annonces prêts' AS resultat;
