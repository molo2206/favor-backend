-- ============================================================================
-- Phase 3 — Réservation DÉDIÉE de véhicules pour organisations + paiement APRÈS prestation
-- Additif. CREATE TABLE IF NOT EXISTS → relançable sans risque.
-- ============================================================================

-- Réservations organisation (montant = jours × dailyRate, figé ; paiement après prestation)
CREATE TABLE IF NOT EXISTS `organization_vehicle_rentals` (
  `id` VARCHAR(36) NOT NULL,
  `reference` VARCHAR(40) NOT NULL,
  `productId` VARCHAR(36) NOT NULL,
  `ownerId` VARCHAR(36) NULL,
  `clientId` VARCHAR(36) NULL,
  `organizationName` VARCHAR(150) NULL,
  `startDate` DATE NOT NULL,
  `endDate` DATE NOT NULL,
  `days` INT NOT NULL DEFAULT 1,
  `dailyRate` DECIMAL(10,2) NOT NULL,
  `totalAmount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
  `responsibilities` JSON NULL,
  `status` ENUM('PENDING','CONFIRMED','IN_PROGRESS','COMPLETED','PAID','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `paymentMethod` VARCHAR(30) NULL,
  `notes` TEXT NULL,
  `createdById` VARCHAR(36) NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ovr_reference` (`reference`),
  KEY `idx_ovr_product` (`productId`),
  KEY `idx_ovr_status` (`status`),
  KEY `idx_ovr_client` (`clientId`),
  KEY `idx_ovr_owner` (`ownerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Paiements des réservations organisation (après prestation ; FPAY / MOBILE_MONEY / CASH)
CREATE TABLE IF NOT EXISTS `organization_rental_payments` (
  `id` VARCHAR(36) NOT NULL,
  `reference` VARCHAR(60) NOT NULL,
  `rentalId` VARCHAR(36) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
  `method` ENUM('FPAY','MOBILE_MONEY','CASH') NOT NULL DEFAULT 'CASH',
  `status` ENUM('PENDING','SUCCESS','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `paymentMethodId` VARCHAR(36) NULL,
  `providerReference` VARCHAR(120) NULL,
  `paidAt` DATETIME(6) NULL,
  `payerId` VARCHAR(36) NULL,
  `beneficiaryId` VARCHAR(36) NULL,
  `failureReason` VARCHAR(255) NULL,
  `createdById` VARCHAR(36) NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orp_reference` (`reference`),
  KEY `idx_orp_rental` (`rentalId`),
  KEY `idx_orp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
