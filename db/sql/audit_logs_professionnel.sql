-- =====================================================================
-- JOURNAL D'AUDIT PROFESSIONNEL — table audit_logs (base favor_db)
-- Aucune donnée existante n'est modifiée ni supprimée. Pas d'information_schema.
--
-- Exécution (phpMyAdmin → favor_db → SQL) :
--   * Exécutez les blocs dans l'ordre.
--   * #1060 « Duplicate column name » : la colonne existe déjà → passez à la ligne suivante.
--   * #1061 « Duplicate key name »    : l'index existe déjà    → passez à la ligne suivante.
--   phpMyAdmin s'arrête à la première erreur : relancez simplement les lignes restantes.
-- =====================================================================

-- 1) Table (seulement si elle n'existe pas encore)
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id`           varchar(36)   NOT NULL,
  `userId`       varchar(255)  NULL,
  `userName`     varchar(150)  NULL,
  `userRole`     varchar(50)   NULL,
  `companyId`    varchar(36)   NULL,
  `action`       varchar(50)   NOT NULL,
  `entity`       varchar(100)  NOT NULL,
  `entityId`     varchar(255)  NULL,
  `category`     varchar(20)   NOT NULL DEFAULT 'BUSINESS',
  `severity`     varchar(10)   NOT NULL DEFAULT 'INFO',
  `oldValue`     json          NULL,
  `newValue`     json          NULL,
  `changes`      json          NULL,
  `metadata`     json          NULL,
  `status`       varchar(10)   NOT NULL DEFAULT 'SUCCESS',
  `httpStatus`   int           NULL,
  `errorMessage` varchar(1000) NULL,
  `durationMs`   int           NULL,
  `ipAddress`    varchar(45)   NULL,
  `userAgent`    varchar(500)  NULL,
  `platform`     varchar(20)   NULL,
  `method`       varchar(10)   NULL,
  `route`        varchar(255)  NULL,
  `url`          varchar(1000) NULL,
  `requestId`    varchar(64)   NULL,
  `signature`    varchar(64)   NULL,
  `createdAt`    datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Nouvelles colonnes (une par ligne)
ALTER TABLE `audit_logs` ADD COLUMN `userName` varchar(150) NULL;
ALTER TABLE `audit_logs` ADD COLUMN `userRole` varchar(50) NULL;
ALTER TABLE `audit_logs` ADD COLUMN `companyId` varchar(36) NULL;
ALTER TABLE `audit_logs` ADD COLUMN `category` varchar(20) NOT NULL DEFAULT 'BUSINESS';
ALTER TABLE `audit_logs` ADD COLUMN `severity` varchar(10) NOT NULL DEFAULT 'INFO';
ALTER TABLE `audit_logs` ADD COLUMN `oldValue` json NULL;
ALTER TABLE `audit_logs` ADD COLUMN `newValue` json NULL;
ALTER TABLE `audit_logs` ADD COLUMN `changes` json NULL;
ALTER TABLE `audit_logs` ADD COLUMN `metadata` json NULL;
ALTER TABLE `audit_logs` ADD COLUMN `status` varchar(10) NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE `audit_logs` ADD COLUMN `httpStatus` int NULL;
ALTER TABLE `audit_logs` ADD COLUMN `errorMessage` varchar(1000) NULL;
ALTER TABLE `audit_logs` ADD COLUMN `durationMs` int NULL;
ALTER TABLE `audit_logs` ADD COLUMN `platform` varchar(20) NULL;
ALTER TABLE `audit_logs` ADD COLUMN `method` varchar(10) NULL;
ALTER TABLE `audit_logs` ADD COLUMN `route` varchar(255) NULL;
ALTER TABLE `audit_logs` ADD COLUMN `url` varchar(1000) NULL;
ALTER TABLE `audit_logs` ADD COLUMN `requestId` varchar(64) NULL;
ALTER TABLE `audit_logs` ADD COLUMN `signature` varchar(64) NULL;

-- 3) Tailles des colonnes existantes (sans perte de données)
ALTER TABLE `audit_logs` MODIFY COLUMN `userAgent` varchar(500) NULL;
ALTER TABLE `audit_logs` MODIFY COLUMN `ipAddress` varchar(45) NULL;
ALTER TABLE `audit_logs` MODIFY COLUMN `entityId` varchar(255) NULL;

-- 4) Index (recherche rapide par date, auteur, ressource, catégorie, entreprise, résultat)
CREATE INDEX `idx_audit_created` ON `audit_logs` (`createdAt`);
CREATE INDEX `idx_audit_user_created` ON `audit_logs` (`userId`, `createdAt`);
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity`, `entityId`);
CREATE INDEX `idx_audit_action` ON `audit_logs` (`action`);
CREATE INDEX `idx_audit_category_created` ON `audit_logs` (`category`, `createdAt`);
CREATE INDEX `idx_audit_company_created` ON `audit_logs` (`companyId`, `createdAt`);
CREATE INDEX `idx_audit_status` ON `audit_logs` (`status`);

-- 5) Contrôle
SELECT COUNT(*) AS lignes, MIN(createdAt) AS premiere, MAX(createdAt) AS derniere FROM `audit_logs`;
