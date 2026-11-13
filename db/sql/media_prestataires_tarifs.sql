-- =====================================================================
-- MÉDIA — PRESTATAIRES EXTERNES : DOMAINES D'INTERVENTION + PRESTATIONS ET TARIFS (base favor_db)
-- Aucune donnée existante modifiée ni supprimée. Pas d'information_schema.
-- Prérequis : la table bo_media_vendors existe (db/sql/media_prestataires.sql).
-- Exécution : phpMyAdmin → favor_db → SQL.
--   #1060 « Duplicate column name » : la colonne existe déjà → exécutez les lignes suivantes.
-- =====================================================================

-- 1) Nouvelles colonnes du prestataire (une par ligne)
ALTER TABLE `bo_media_vendors` ADD COLUMN `domains` json NULL;
ALTER TABLE `bo_media_vendors` ADD COLUMN `domainOther` varchar(150) NULL;
ALTER TABLE `bo_media_vendors` ADD COLUMN `conditions` text NULL;

-- 2) Prestations et tarifs
CREATE TABLE IF NOT EXISTS `bo_media_vendor_rates` (
  `id`          varchar(36)   NOT NULL,
  `companyId`   varchar(36)   NOT NULL,
  `vendorId`    varchar(36)   NOT NULL,
  `name`        varchar(150)  NOT NULL,
  `description` varchar(1000) NULL,
  `domain`      varchar(30)   NULL,
  `category`    varchar(30)   NULL,
  `unit`        varchar(20)   NOT NULL DEFAULT 'PROJECT',
  `price`       decimal(14,2) NOT NULL,
  `currency`    varchar(10)   NOT NULL DEFAULT 'USD',
  `conditions`  varchar(1000) NULL,
  `isActive`    tinyint       NOT NULL DEFAULT 1,
  `sortOrder`   int           NOT NULL DEFAULT 0,
  `createdById` varchar(36)   NULL,
  `createdAt`   datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`   datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_media_vendor_rate_vendor` (`vendorId`, `isActive`),
  KEY `idx_bo_media_vendor_rate_company` (`companyId`, `domain`, `isActive`),
  CONSTRAINT `fk_bo_media_vendor_rate_vendor` FOREIGN KEY (`vendorId`) REFERENCES `bo_media_vendors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) (Facultatif) Reprendre l'ancien tarif unique de chaque prestataire comme première prestation
INSERT INTO `bo_media_vendor_rates` (`id`, `companyId`, `vendorId`, `name`, `unit`, `price`, `currency`, `isActive`, `sortOrder`)
SELECT UUID(), v.`companyId`, v.`id`, 'Tarif standard', COALESCE(v.`rateUnit`, 'PROJECT'), v.`rateAmount`, COALESCE(v.`currency`, 'USD'), 1, 0
FROM `bo_media_vendors` v
WHERE v.`rateAmount` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `bo_media_vendor_rates` r WHERE r.`vendorId` = v.`id`);

-- 4) Contrôle
SELECT COUNT(*) AS prestations FROM `bo_media_vendor_rates`;
