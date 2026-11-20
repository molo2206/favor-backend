-- ============================================================================
-- Phase 1 — Contrôle technique des véhicules de location + catégorie de location
-- Additif : ne supprime rien, n'altère aucune donnée existante.
-- Exécuter chaque instruction UNE par UNE. Si une colonne/un index existe déjà,
-- MySQL renvoie #1060 (Duplicate column) ou #1061 (Duplicate key) : ignorez et continuez.
-- ============================================================================

-- 1) Catégorie de location sur les produits (véhicules). Défaut PRIVATE → aucun impact.
ALTER TABLE `products` ADD COLUMN `rentalCategory` ENUM('PRIVATE','ORGANIZATION') NULL DEFAULT 'PRIVATE';

-- 2) Tarif du contrôle technique (configurable par super-admin, historique conservé)
CREATE TABLE IF NOT EXISTS `technical_control_tariffs` (
  `id` VARCHAR(36) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
  `isActive` TINYINT NOT NULL DEFAULT 1,
  `configuredById` VARCHAR(36) NULL,
  `note` VARCHAR(255) NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_tc_tariff_active` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Fiche de contrôle technique (+ historique via previousControlId)
CREATE TABLE IF NOT EXISTS `vehicle_technical_controls` (
  `id` VARCHAR(36) NOT NULL,
  `reference` VARCHAR(40) NOT NULL,
  `productId` VARCHAR(36) NOT NULL,
  `vehicleRegistrationNumber` VARCHAR(100) NULL,
  `vehicleModel` VARCHAR(100) NULL,
  `vehicleYear` VARCHAR(20) NULL,
  `vehicleBrand` VARCHAR(100) NULL,
  `ownerId` VARCHAR(36) NULL,
  `controlDate` DATETIME(6) NULL,
  `agentId` VARCHAR(36) NULL,
  `generalState` VARCHAR(255) NULL,
  `results` JSON NULL,
  `observations` TEXT NULL,
  `documents` JSON NULL,
  `expiryDate` DATE NULL,
  `status` ENUM('PENDING_PAYMENT','PAYMENT_CONFIRMED','IN_PROGRESS','VALIDATED','REJECTED','EXPIRED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  `amountPaid` DECIMAL(10,2) NULL,
  `currency` VARCHAR(10) NULL,
  `previousControlId` VARCHAR(36) NULL,
  `paymentWaived` TINYINT NOT NULL DEFAULT 0,
  `paymentWaivedReason` VARCHAR(255) NULL,
  `createdById` VARCHAR(36) NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tc_reference` (`reference`),
  KEY `idx_tc_product` (`productId`),
  KEY `idx_tc_status` (`status`),
  KEY `idx_tc_expiry` (`expiryDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) Paiements du contrôle technique (référence unique, statut, historique)
CREATE TABLE IF NOT EXISTS `technical_control_payments` (
  `id` VARCHAR(36) NOT NULL,
  `reference` VARCHAR(60) NOT NULL,
  `controlId` VARCHAR(36) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
  `paymentMethod` VARCHAR(30) NULL,
  `paymentMethodId` VARCHAR(36) NULL,
  `providerReference` VARCHAR(120) NULL,
  `status` ENUM('PENDING','CONFIRMED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `paidAt` DATETIME(6) NULL,
  `payerId` VARCHAR(36) NULL,
  `createdById` VARCHAR(36) NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tcp_reference` (`reference`),
  KEY `idx_tcp_control` (`controlId`),
  KEY `idx_tcp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
