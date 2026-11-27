-- =====================================================================
-- Clients du point de vente, propres à chaque entreprise (sans compte système).
-- Script NON destructif. À exécuter une fois.
-- =====================================================================

CREATE TABLE IF NOT EXISTS `pos_customers` (
  `id`        VARCHAR(36)  NOT NULL,
  `companyId` VARCHAR(36)  NOT NULL,
  `name`      VARCHAR(150) NOT NULL,
  `phone`     VARCHAR(40)  NULL,
  `email`     VARCHAR(150) NULL,
  `address`   VARCHAR(255) NULL,
  `note`      VARCHAR(500) NULL,
  `userId`    VARCHAR(36)  NULL,
  `isActive`  TINYINT(1)   NOT NULL DEFAULT 1,
  `createdAt` DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_pos_customer_company_phone` (`companyId`,`phone`),
  KEY `idx_pos_customer_company_name` (`companyId`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
