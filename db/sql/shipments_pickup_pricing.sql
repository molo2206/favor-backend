-- ============================================================================
-- Shipments — Ramassage tarifé (même logique que les colis).
-- Base favor_db. Exécuter chaque ALTER un par un ; ignorer #1060 si tu relances.
-- (La colonne pickupPrice existe déjà sur `shipments` : elle porte le prix calculé.)
-- ============================================================================

ALTER TABLE `shipments` ADD COLUMN `pickupCountryId` CHAR(36) NULL;
ALTER TABLE `shipments` ADD COLUMN `pickupCityId` CHAR(36) NULL;
ALTER TABLE `shipments` ADD COLUMN `pickupCurrency` VARCHAR(10) NULL;
ALTER TABLE `shipments` ADD COLUMN `pickupPaymentTiming` ENUM('PAID_TO_SUPPLIER','PAY_ON_PICKUP') NULL;
ALTER TABLE `shipments` ADD COLUMN `pickupPaymentMethod` VARCHAR(30) NULL;
ALTER TABLE `shipments` ADD COLUMN `pickupPaymentStatus` ENUM('PENDING','PAID') NOT NULL DEFAULT 'PENDING';
ALTER TABLE `shipments` ADD COLUMN `pickupPaidAt` DATETIME(6) NULL;
ALTER TABLE `shipments` ADD COLUMN `pickupPaymentReference` VARCHAR(100) NULL;
