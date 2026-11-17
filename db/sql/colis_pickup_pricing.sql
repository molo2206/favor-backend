-- ============================================================================
-- Colis — Ramassage : zone, prix (selon le poids) et paiement.
-- Base favor_db. Exécuter chaque ALTER un par un ; ignorer #1060 (colonne
-- déjà présente) si tu relances.
-- ============================================================================

ALTER TABLE `colis` ADD COLUMN `pickupCountryId` CHAR(36) NULL;
ALTER TABLE `colis` ADD COLUMN `pickupCityId` CHAR(36) NULL;
ALTER TABLE `colis` ADD COLUMN `pickupPrice` DECIMAL(10,2) NULL;
ALTER TABLE `colis` ADD COLUMN `pickupCurrency` VARCHAR(10) NULL DEFAULT 'USD';
ALTER TABLE `colis` ADD COLUMN `pickupTariffId` CHAR(36) NULL;
ALTER TABLE `colis` ADD COLUMN `pickupPaymentTiming` ENUM('PAID_TO_SUPPLIER','PAY_ON_PICKUP') NULL;
ALTER TABLE `colis` ADD COLUMN `pickupPaymentStatus` ENUM('PENDING','PAID') NOT NULL DEFAULT 'PENDING';
ALTER TABLE `colis` ADD COLUMN `pickupPaidAt` DATETIME(6) NULL;
ALTER TABLE `colis` ADD COLUMN `pickupPaymentMethod` VARCHAR(30) NULL;
ALTER TABLE `colis` ADD COLUMN `pickupPaymentReference` VARCHAR(100) NULL;

-- Montant dû au fournisseur (si pas encore payé)
ALTER TABLE `colis` ADD COLUMN `supplierAmountDue` DECIMAL(12,2) NULL;
