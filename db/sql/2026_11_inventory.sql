-- =====================================================================
-- Inventaire avancé + capacités par type d'entreprise (socle POS & offline)
-- Script NON destructif (CREATE TABLE IF NOT EXISTS). À exécuter une fois.
-- =====================================================================

-- 1) Capacités par type (surcharge des défauts du code)
CREATE TABLE IF NOT EXISTS `type_company_config` (
  `companyType`          VARCHAR(40)  NOT NULL,
  `hasInventory`         TINYINT(1)   NULL,
  `hasPOS`               TINYINT(1)   NULL,
  `offlineEnabled`       TINYINT(1)   NULL,
  `tracksLots`           TINYINT(1)   NULL,
  `tracksExpiry`         TINYINT(1)   NULL,
  `requiresPrescription` TINYINT(1)   NULL,
  `controlledRegister`   TINYINT(1)   NULL,
  `sellByFraction`       TINYINT(1)   NULL,
  `allowNegativeStock`   TINYINT(1)   NULL,
  `offlineAllowedOps`    JSON         NULL,
  `createdAt`            DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`            DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`companyType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed : valeurs par défaut visibles/éditables (identiques au code). Modifiable à chaud.
INSERT IGNORE INTO `type_company_config`
  (`companyType`,`hasInventory`,`hasPOS`,`offlineEnabled`,`tracksLots`,`tracksExpiry`,`requiresPrescription`,`controlledRegister`,`sellByFraction`,`allowNegativeStock`,`offlineAllowedOps`)
VALUES
  ('SHOP',      1,1,1,0,0,0,0,0,0, JSON_ARRAY('SALE','STOCK_OUT','STOCK_IN','PRICE_LOOKUP','PRODUCT_MANAGE')),
  ('GROCERY',   1,1,1,0,0,0,0,0,0, JSON_ARRAY('SALE','STOCK_OUT','STOCK_IN','PRICE_LOOKUP','PRODUCT_MANAGE')),
  ('RESTAURANT',1,1,1,0,1,0,0,0,1, JSON_ARRAY('SALE','STOCK_OUT','PRICE_LOOKUP','PRODUCT_MANAGE')),
  ('PHARMACIE', 1,1,1,1,1,1,1,1,0, JSON_ARRAY('SALE','STOCK_OUT','PRICE_LOOKUP','PRODUCT_MANAGE'));

-- 2) Emplacements de stock
CREATE TABLE IF NOT EXISTS `stock_locations` (
  `id`            VARCHAR(36)  NOT NULL,
  `companyId`     VARCHAR(36)  NOT NULL,
  `branchId`      VARCHAR(36)  NULL,
  `name`          VARCHAR(120) NOT NULL,
  `type`          ENUM('WAREHOUSE','SHELF','COLD','OTHER') NOT NULL DEFAULT 'SHELF',
  `isDefaultSale` TINYINT(1)   NOT NULL DEFAULT 0,
  `isActive`      TINYINT(1)   NOT NULL DEFAULT 1,
  `createdAt`     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_stock_location_company` (`companyId`,`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Stock par produit × emplacement (état matérialisé)
CREATE TABLE IF NOT EXISTS `stock_items` (
  `id`          VARCHAR(36)    NOT NULL,
  `companyId`   VARCHAR(36)    NOT NULL,
  `locationId`  VARCHAR(36)    NOT NULL,
  `productId`   VARCHAR(36)    NOT NULL,
  `quantity`    DECIMAL(14,3)  NOT NULL DEFAULT 0,
  `reserved`    DECIMAL(14,3)  NOT NULL DEFAULT 0,
  `minQuantity` DECIMAL(14,3)  NOT NULL DEFAULT 0,
  `createdAt`   DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`   DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stock_item` (`locationId`,`productId`),
  KEY `idx_stock_item_company_product` (`companyId`,`productId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Lots (pharmacie / denrées) — FEFO
CREATE TABLE IF NOT EXISTS `stock_lots` (
  `id`         VARCHAR(36)    NOT NULL,
  `companyId`  VARCHAR(36)    NOT NULL,
  `locationId` VARCHAR(36)    NOT NULL,
  `productId`  VARCHAR(36)    NOT NULL,
  `lotNumber`  VARCHAR(80)    NOT NULL,
  `expiryDate` DATE           NULL,
  `quantity`   DECIMAL(14,3)  NOT NULL DEFAULT 0,
  `costPrice`  DECIMAL(14,2)  NULL,
  `supplier`   VARCHAR(150)   NULL,
  `status`     ENUM('ACTIVE','EXPIRED','RECALLED','DEPLETED') NOT NULL DEFAULT 'ACTIVE',
  `createdAt`  DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`  DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_stock_lot_fefo` (`companyId`,`productId`,`status`,`expiryDate`),
  KEY `idx_stock_lot_location` (`locationId`,`productId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Journal des mouvements (source de vérité)
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id`            VARCHAR(36)    NOT NULL,
  `companyId`     VARCHAR(36)    NOT NULL,
  `locationId`    VARCHAR(36)    NOT NULL,
  `productId`     VARCHAR(36)    NOT NULL,
  `lotId`         VARCHAR(36)    NULL,
  `type`          ENUM('IN','OUT','ADJUST','TRANSFER_OUT','TRANSFER_IN','RETURN') NOT NULL,
  `source`        ENUM('MANUAL','POS','ORDER','SYNC','TRANSFER','INVENTORY') NOT NULL DEFAULT 'MANUAL',
  `quantity`      DECIMAL(14,3)  NOT NULL,
  `balanceAfter`  DECIMAL(14,3)  NULL,
  `reference`     VARCHAR(100)   NULL,
  `reason`        VARCHAR(255)   NULL,
  `performedById` VARCHAR(36)    NULL,
  `createdAt`     DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_stock_mvt_product` (`companyId`,`productId`,`createdAt`),
  KEY `idx_stock_mvt_location` (`locationId`,`createdAt`),
  KEY `idx_stock_mvt_ref` (`reference`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) Métadonnées pharmacie d'un produit (ordonnance, contrôlé, DCI…)
CREATE TABLE IF NOT EXISTS `product_pharma_meta` (
  `productId`            VARCHAR(36)  NOT NULL,
  `requiresPrescription` TINYINT(1)   NOT NULL DEFAULT 0,
  `isControlled`         TINYINT(1)   NOT NULL DEFAULT 0,
  `dci`                  VARCHAR(150) NULL,
  `dosage`               VARCHAR(60)  NULL,
  `unitsPerPack`         INT          NULL,
  `updatedAt`            DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`productId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
