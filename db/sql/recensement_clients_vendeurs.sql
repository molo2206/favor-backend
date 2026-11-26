-- =====================================================================================
-- ✅ Recensement des clients et vendeurs existants (relance des anciens clients)
--    Base : favor_db — 2 NOUVELLES tables, aucune table existante modifiée.
-- =====================================================================================
USE `favor_db`;

CREATE TABLE IF NOT EXISTS `census_records` (
  `id` varchar(36) NOT NULL,
  `type` enum('CLIENT','VENDOR') NOT NULL DEFAULT 'CLIENT',
  `fullName` varchar(150) NOT NULL,
  `businessName` varchar(150) NULL,
  `phone` varchar(30) NULL,
  `whatsapp` varchar(30) NULL,
  `email` varchar(150) NULL,
  `cityId` varchar(36) NULL,
  `district` varchar(150) NULL,
  `address` varchar(255) NULL,
  `activity` varchar(150) NULL,
  `usualProducts` text NULL,
  `frequency` varchar(100) NULL,
  `lastActivityAt` datetime NULL,
  `inactiveReason` text NULL,
  `needs` text NULL,
  `satisfaction` tinyint NULL,
  `consent` tinyint NOT NULL DEFAULT 1,
  `notes` text NULL,
  `userId` varchar(36) NULL,
  `vendorCompanyId` varchar(36) NULL,
  `status` enum('TO_CONTACT','CONTACTED','INTERESTED','NOT_INTERESTED','UNREACHABLE','REACTIVATED') NOT NULL DEFAULT 'TO_CONTACT',
  `source` enum('FIELD','PHONE','PLATFORM') NOT NULL DEFAULT 'FIELD',
  `nextFollowUpAt` datetime NULL,
  `lastContactAt` datetime NULL,
  `contactCount` int NOT NULL DEFAULT 0,
  `recordedById` varchar(36) NULL,
  `assignedToId` varchar(36) NULL,
  `branchId` varchar(36) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_census_type_status` (`type`, `status`),
  KEY `idx_census_phone` (`phone`),
  KEY `idx_census_user` (`userId`),
  KEY `idx_census_vendor_company` (`vendorCompanyId`),
  KEY `idx_census_next_followup` (`nextFollowUpAt`),
  KEY `idx_census_assigned` (`assignedToId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `census_followups` (
  `id` varchar(36) NOT NULL,
  `recordId` varchar(36) NOT NULL,
  `channel` enum('CALL','SMS','WHATSAPP','VISIT','EMAIL') NOT NULL DEFAULT 'CALL',
  `result` enum('REACHED','NOT_REACHED','CALL_BACK','INTERESTED','NOT_INTERESTED','REACTIVATED') NOT NULL,
  `note` text NULL,
  `nextFollowUpAt` datetime NULL,
  `createdById` varchar(36) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_census_followups_record` (`recordId`),
  CONSTRAINT `FK_census_followups_record` FOREIGN KEY (`recordId`) REFERENCES `census_records` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vérification : 2 lignes attendues
SHOW TABLES LIKE 'census_%';
