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

-- Montant dû au fournisseur (si pas encore payé)
ALTER TABLE `shipments` ADD COLUMN `supplierAmountDue` DECIMAL(12,2) NULL;

-- Vérification du poids au ramassage (le poids constaté par le livreur fait foi)
ALTER TABLE `shipments` ADD COLUMN `declaredWeight` FLOAT NULL;
ALTER TABLE `shipments` ADD COLUMN `verifiedWeight` FLOAT NULL;
ALTER TABLE `shipments` ADD COLUMN `verifiedBy` CHAR(36) NULL;
ALTER TABLE `shipments` ADD COLUMN `verifiedAt` DATETIME(6) NULL;
ALTER TABLE `shipments` ADD COLUMN `pickupPriceAdjustment` DECIMAL(12,2) NULL;
ALTER TABLE `shipments` ADD COLUMN `pickupSurchargeDue` DECIMAL(12,2) NULL;
ALTER TABLE `shipments` ADD COLUMN `pickupRefundDue` DECIMAL(12,2) NULL;
