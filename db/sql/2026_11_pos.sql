-- =====================================================================
-- Point de vente (caisse) + synchro offline
-- Script NON destructif (CREATE TABLE IF NOT EXISTS). À exécuter une fois,
-- APRÈS 2026_11_inventory.sql.
-- =====================================================================

-- 1) Terminaux / caisses (config POS dynamique)
CREATE TABLE IF NOT EXISTS `pos_terminals` (
  `id`             VARCHAR(36)  NOT NULL,
  `companyId`      VARCHAR(36)  NOT NULL,
  `branchId`       VARCHAR(36)  NULL,
  `locationId`     VARCHAR(36)  NULL,
  `name`           VARCHAR(120) NOT NULL,
  `code`           VARCHAR(40)  NOT NULL,
  `config`         JSON         NULL,
  `offlineEnabled` TINYINT(1)   NOT NULL DEFAULT 1,
  `lastSyncSeq`    BIGINT       NOT NULL DEFAULT 0,
  `isActive`       TINYINT(1)   NOT NULL DEFAULT 1,
  `createdAt`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_terminal_code` (`companyId`,`code`),
  KEY `idx_pos_terminal_company` (`companyId`,`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Sessions de caisse
CREATE TABLE IF NOT EXISTS `pos_sessions` (
  `id`             VARCHAR(36)   NOT NULL,
  `companyId`      VARCHAR(36)   NOT NULL,
  `terminalId`     VARCHAR(36)   NOT NULL,
  `status`         ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  `openedById`     VARCHAR(36)   NOT NULL,
  `openingCash`    DECIMAL(14,2) NOT NULL DEFAULT 0,
  `openedAt`       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `closedById`     VARCHAR(36)   NULL,
  `closedAt`       DATETIME(6)   NULL,
  `expectedCash`   DECIMAL(14,2) NULL,
  `countedCash`    DECIMAL(14,2) NULL,
  `cashDifference` DECIMAL(14,2) NULL,
  `totalSales`     DECIMAL(14,2) NOT NULL DEFAULT 0,
  `salesCount`     INT           NOT NULL DEFAULT 0,
  `currency`       VARCHAR(10)   NOT NULL DEFAULT 'USD',
  `updatedAt`      DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_pos_session_terminal` (`terminalId`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Ventes (tickets)
CREATE TABLE IF NOT EXISTS `pos_sales` (
  `id`              VARCHAR(36)   NOT NULL,
  `companyId`       VARCHAR(36)   NOT NULL,
  `terminalId`      VARCHAR(36)   NOT NULL,
  `sessionId`       VARCHAR(36)   NOT NULL,
  `number`          VARCHAR(40)   NOT NULL,
  `customerId`      VARCHAR(36)   NULL,
  `customerName`    VARCHAR(150)  NULL,
  `subtotal`        DECIMAL(14,2) NOT NULL DEFAULT 0,
  `discount`        DECIMAL(14,2) NOT NULL DEFAULT 0,
  `tax`             DECIMAL(14,2) NOT NULL DEFAULT 0,
  `total`           DECIMAL(14,2) NOT NULL DEFAULT 0,
  `currency`        VARCHAR(10)   NOT NULL DEFAULT 'USD',
  `paymentMethod`   ENUM('CASH','FPAY','MOBILE_MONEY','CARD','OTHER') NOT NULL DEFAULT 'CASH',
  `status`          ENUM('PAID','VOID') NOT NULL DEFAULT 'PAID',
  `source`          ENUM('ONLINE','OFFLINE') NOT NULL DEFAULT 'ONLINE',
  `hasPrescription` TINYINT(1)    NOT NULL DEFAULT 0,
  `clientOpId`      VARCHAR(80)   NULL,
  `cashierId`       VARCHAR(36)   NULL,
  `soldAt`          DATETIME(6)   NULL,
  `createdAt`       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_sale_client_op` (`terminalId`,`clientOpId`),
  KEY `idx_pos_sale_company` (`companyId`,`createdAt`),
  KEY `idx_pos_sale_session` (`sessionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Lignes de vente
CREATE TABLE IF NOT EXISTS `pos_sale_items` (
  `id`          VARCHAR(36)   NOT NULL,
  `saleId`      VARCHAR(36)   NOT NULL,
  `productId`   VARCHAR(36)   NOT NULL,
  `locationId`  VARCHAR(36)   NULL,
  `productName` VARCHAR(200)  NOT NULL,
  `unitPrice`   DECIMAL(14,2) NOT NULL DEFAULT 0,
  `quantity`    DECIMAL(14,3) NOT NULL DEFAULT 0,
  `lineTotal`   DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_pos_sale_item_sale` (`saleId`),
  KEY `idx_pos_sale_item_product` (`productId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Journal idempotent de la synchro offline
CREATE TABLE IF NOT EXISTS `pos_sync_operations` (
  `id`         VARCHAR(36)  NOT NULL,
  `companyId`  VARCHAR(36)  NOT NULL,
  `terminalId` VARCHAR(36)  NOT NULL,
  `clientOpId` VARCHAR(80)  NOT NULL,
  `seq`        BIGINT       NOT NULL DEFAULT 0,
  `type`       VARCHAR(30)  NOT NULL,
  `status`     VARCHAR(20)  NOT NULL,
  `result`     JSON         NULL,
  `createdAt`  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_sync_op` (`terminalId`,`clientOpId`),
  KEY `idx_pos_sync_terminal_seq` (`terminalId`,`seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
