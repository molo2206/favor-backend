-- ============================================================
-- ✅ Prospects : pays, ville, réseau social, langues, suivi des agents, doublons, historique
-- Base : favor_db
-- Si une ligne donne #1060 (colonne déjà là) ou #1061 (index déjà là) : passez à la suivante.
-- ============================================================

-- 1) Nouvelles colonnes de la table prospects
ALTER TABLE `prospects` ADD COLUMN `socialNetwork` varchar(20) NULL AFTER `source`;
ALTER TABLE `prospects` ADD COLUMN `socialNetworkOther` varchar(100) NULL AFTER `socialNetwork`;
ALTER TABLE `prospects` ADD COLUMN `countryId` varchar(36) NULL AFTER `socialNetworkOther`;
ALTER TABLE `prospects` ADD COLUMN `countryName` varchar(120) NULL AFTER `countryId`;
ALTER TABLE `prospects` ADD COLUMN `cityId` varchar(36) NULL AFTER `countryName`;
ALTER TABLE `prospects` ADD COLUMN `cityName` varchar(120) NULL AFTER `cityId`;
ALTER TABLE `prospects` ADD COLUMN `languages` json NULL AFTER `cityName`;
ALTER TABLE `prospects` ADD COLUMN `createdById` varchar(36) NULL;
ALTER TABLE `prospects` ADD COLUMN `assignedById` varchar(36) NULL;
ALTER TABLE `prospects` ADD COLUMN `assignedAt` datetime NULL;
ALTER TABLE `prospects` ADD COLUMN `processedAt` datetime NULL;
ALTER TABLE `prospects` ADD COLUMN `convertedAt` datetime NULL;
ALTER TABLE `prospects` ADD COLUMN `lostAt` datetime NULL;
ALTER TABLE `prospects` ADD COLUMN `lostReason` varchar(500) NULL;
ALTER TABLE `prospects` ADD COLUMN `statusChangedAt` datetime NULL;
ALTER TABLE `prospects` ADD COLUMN `linkedUserId` varchar(36) NULL;
ALTER TABLE `prospects` ADD COLUMN `linkedAt` datetime NULL;

-- 2) Index
ALTER TABLE `prospects` ADD INDEX `idx_prospects_country` (`countryId`);
ALTER TABLE `prospects` ADD INDEX `idx_prospects_city` (`cityId`);
ALTER TABLE `prospects` ADD INDEX `idx_prospects_created_by` (`createdById`);
ALTER TABLE `prospects` ADD INDEX `idx_prospects_linked_user` (`linkedUserId`);
ALTER TABLE `prospects` ADD INDEX `idx_prospects_status_created` (`status`, `createdAt`);

-- 3) Historique des assignations / transferts
CREATE TABLE IF NOT EXISTS `prospect_assignments` (
  `id` varchar(36) NOT NULL,
  `prospectId` varchar(36) NOT NULL,
  `prospectName` varchar(255) NULL,
  `type` varchar(20) NOT NULL,
  `fromUserId` varchar(36) NULL,
  `fromUserName` varchar(150) NULL,
  `toUserId` varchar(36) NULL,
  `toUserName` varchar(150) NULL,
  `assignedById` varchar(36) NULL,
  `assignedByName` varchar(150) NULL,
  `statusAtAssignment` varchar(30) NULL,
  `note` varchar(500) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_prospect_assign_prospect` (`prospectId`, `createdAt`),
  KEY `idx_prospect_assign_by` (`assignedById`, `createdAt`),
  KEY `idx_prospect_assign_to` (`toUserId`, `createdAt`),
  KEY `idx_prospect_assign_from` (`fromUserId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Journal des activités
CREATE TABLE IF NOT EXISTS `prospect_history` (
  `id` varchar(36) NOT NULL,
  `prospectId` varchar(36) NOT NULL,
  `prospectName` varchar(255) NULL,
  `action` varchar(30) NOT NULL,
  `userId` varchar(36) NULL,
  `userName` varchar(150) NULL,
  `oldStatus` varchar(30) NULL,
  `newStatus` varchar(30) NULL,
  `changes` json NULL,
  `note` varchar(500) NULL,
  `metadata` json NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_prospect_history_prospect` (`prospectId`, `createdAt`),
  KEY `idx_prospect_history_user` (`userId`, `createdAt`),
  KEY `idx_prospect_history_action` (`action`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Anciens prospects : dates de suivi déduites (à lancer une seule fois)
UPDATE `prospects` SET `processedAt` = `updatedAt` WHERE `processedAt` IS NULL AND `status` <> 'NEW';
UPDATE `prospects` SET `convertedAt` = `updatedAt` WHERE `convertedAt` IS NULL AND `status` = 'WON';
UPDATE `prospects` SET `lostAt` = `updatedAt` WHERE `lostAt` IS NULL AND `status` = 'LOST';
UPDATE `prospects` SET `assignedAt` = `createdAt` WHERE `assignedAt` IS NULL AND `assignedToId` IS NOT NULL;

SHOW TABLES LIKE 'prospect_%';
