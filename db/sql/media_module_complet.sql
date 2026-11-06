-- =====================================================================
-- MODULE MÉDIAS COMPLET — base favor_db (16 tables)
-- Projets, séances, médiathèque, publications, prestataires externes (photo, domaines,
-- prestations et tarifs), missions et paiements des prestataires.
--
-- Pour un serveur où le module Médias n'a jamais été installé.
-- Pas d'information_schema. CREATE TABLE IF NOT EXISTS : une table déjà présente n'est pas touchée.
-- Les tables sont créées directement avec toutes leurs colonnes actuelles :
-- N'EXÉCUTEZ PAS ensuite media_prestataires.sql ni media_prestataires_tarifs.sql
-- ni la ligne « photoUrl » de sessions_sauvegardes_bases_photo_prestataire.sql.
-- Exécution : phpMyAdmin → favor_db → SQL.
-- =====================================================================

-- 1) Catalogue des prestations
CREATE TABLE IF NOT EXISTS `bo_media_services` (
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `name` varchar(150) NOT NULL,
  `code` varchar(20) NULL DEFAULT NULL,
  `category` enum('PHOTOGRAPHY','VIDEOGRAPHY','DRONE','LIVE_STREAMING','EDITING','GRAPHIC_DESIGN','SOCIAL_MEDIA','WEB_DIGITAL','PRINTING','OTHER') NOT NULL DEFAULT 'OTHER',
  `description` text NULL,
  `unit` enum('HOUR','DAY','SESSION','PROJECT','ITEM','MONTH') NOT NULL DEFAULT 'SESSION',
  `unitPrice` decimal(14,2) NOT NULL DEFAULT 0,
  `currency` varchar(10) NOT NULL DEFAULT 'USD',
  `durationMinutes` int NULL DEFAULT NULL,
  `deliverables` varchar(500) NULL DEFAULT NULL,
  `deliveryDays` int NULL DEFAULT NULL,
  `imageUrl` varchar(500) NULL DEFAULT NULL,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_media_service_company` (`companyId`,`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Projets / commandes
CREATE TABLE IF NOT EXISTS `bo_media_projects` (
  `id` varchar(36) NOT NULL,
  `reference` varchar(30) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `kind` enum('EXTERNAL','INTERNAL') NOT NULL DEFAULT 'EXTERNAL',
  `clientUserId` varchar(36) NULL DEFAULT NULL,
  `clientCompanyId` varchar(36) NULL DEFAULT NULL,
  `requestingDepartment` varchar(120) NULL DEFAULT NULL,
  `clientName` varchar(150) NULL DEFAULT NULL,
  `clientPhone` varchar(50) NULL DEFAULT NULL,
  `clientEmail` varchar(150) NULL DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `description` text NULL,
  `eventType` varchar(100) NULL DEFAULT NULL,
  `eventDate` datetime(6) NULL DEFAULT NULL,
  `location` varchar(255) NULL DEFAULT NULL,
  `dueDate` date NULL DEFAULT NULL,
  `status` enum('REQUEST','QUOTED','CONFIRMED','IN_PRODUCTION','POST_PRODUCTION','DELIVERED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'REQUEST',
  `priority` enum('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  `managerId` varchar(36) NULL DEFAULT NULL,
  `subtotal` decimal(14,2) NOT NULL DEFAULT 0,
  `discount` decimal(14,2) NOT NULL DEFAULT 0,
  `taxRate` decimal(5,2) NOT NULL DEFAULT 0,
  `total` decimal(14,2) NOT NULL DEFAULT 0,
  `amountPaid` decimal(14,2) NOT NULL DEFAULT 0,
  `paymentStatus` enum('UNPAID','PARTIAL','PAID','NOT_APPLICABLE') NOT NULL DEFAULT 'UNPAID',
  `currency` varchar(10) NOT NULL DEFAULT 'USD',
  `deliveryToken` varchar(64) NULL DEFAULT NULL,
  `deliveryTokenExpiresAt` datetime(6) NULL DEFAULT NULL,
  `quotedAt` datetime(6) NULL DEFAULT NULL,
  `confirmedAt` datetime(6) NULL DEFAULT NULL,
  `deliveredAt` datetime(6) NULL DEFAULT NULL,
  `completedAt` datetime(6) NULL DEFAULT NULL,
  `cancelledAt` datetime(6) NULL DEFAULT NULL,
  `cancelReason` varchar(500) NULL DEFAULT NULL,
  `notes` text NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bo_media_project_reference` (`reference`),
  UNIQUE KEY `uq_bo_media_project_delivery_token` (`deliveryToken`),
  KEY `idx_bo_media_project_company_status` (`companyId`,`status`),
  KEY `idx_bo_media_project_event` (`companyId`,`eventDate`),
  KEY `idx_bo_media_projects_clientUserId` (`clientUserId`),
  KEY `idx_bo_media_projects_managerId` (`managerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Lignes du devis
CREATE TABLE IF NOT EXISTS `bo_media_project_items` (
  `id` varchar(36) NOT NULL,
  `projectId` varchar(36) NOT NULL,
  `serviceId` varchar(36) NULL DEFAULT NULL,
  `label` varchar(200) NOT NULL,
  `quantity` decimal(10,2) NOT NULL DEFAULT 1,
  `unit` enum('HOUR','DAY','SESSION','PROJECT','ITEM','MONTH') NOT NULL DEFAULT 'SESSION',
  `unitPrice` decimal(14,2) NOT NULL DEFAULT 0,
  `total` decimal(14,2) NOT NULL DEFAULT 0,
  `position` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_bo_media_item_project` (`projectId`),
  CONSTRAINT `fk_bo_media_item_project` FOREIGN KEY (`projectId`) REFERENCES `bo_media_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bo_media_item_service` FOREIGN KEY (`serviceId`) REFERENCES `bo_media_services` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Planning des séances
CREATE TABLE IF NOT EXISTS `bo_media_sessions` (
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `projectId` varchar(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `type` enum('PHOTO','VIDEO','PHOTO_VIDEO','DRONE','LIVE','EDITING','MEETING','OTHER') NOT NULL DEFAULT 'PHOTO',
  `startAt` datetime(6) NOT NULL,
  `endAt` datetime(6) NOT NULL,
  `location` varchar(255) NULL DEFAULT NULL,
  `latitude` decimal(10,7) NULL DEFAULT NULL,
  `longitude` decimal(10,7) NULL DEFAULT NULL,
  `status` enum('PLANNED','IN_PROGRESS','DONE','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  `notes` text NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_media_session_company_date` (`companyId`,`startAt`),
  KEY `idx_bo_media_session_project` (`projectId`),
  CONSTRAINT `fk_bo_media_session_project` FOREIGN KEY (`projectId`) REFERENCES `bo_media_projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Équipe affectée aux séances
CREATE TABLE IF NOT EXISTS `bo_media_session_crew` (
  `id` varchar(36) NOT NULL,
  `sessionId` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `role` enum('PHOTOGRAPHER','VIDEOGRAPHER','DRONE_PILOT','EDITOR','DESIGNER','COMMUNITY_MANAGER','DIRECTOR','ASSISTANT','OTHER') NOT NULL DEFAULT 'OTHER',
  `note` varchar(255) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bo_media_crew` (`sessionId`,`userId`),
  KEY `idx_bo_media_crew_user` (`userId`),
  CONSTRAINT `fk_bo_media_crew_session` FOREIGN KEY (`sessionId`) REFERENCES `bo_media_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) Matériel réservé
CREATE TABLE IF NOT EXISTS `bo_media_session_equipment` (
  `id` varchar(36) NOT NULL,
  `sessionId` varchar(36) NOT NULL,
  `assetId` varchar(36) NOT NULL,
  `note` varchar(255) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bo_media_equipment` (`sessionId`,`assetId`),
  KEY `idx_bo_media_equipment_asset` (`assetId`),
  CONSTRAINT `fk_bo_media_equipment_session` FOREIGN KEY (`sessionId`) REFERENCES `bo_media_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7) Médiathèque
CREATE TABLE IF NOT EXISTS `bo_media_files` (
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `projectId` varchar(36) NULL DEFAULT NULL,
  `sessionId` varchar(36) NULL DEFAULT NULL,
  `type` enum('PHOTO','VIDEO','AUDIO','DOCUMENT','LINK') NOT NULL,
  `title` varchar(200) NULL DEFAULT NULL,
  `description` varchar(500) NULL DEFAULT NULL,
  `url` varchar(1000) NOT NULL,
  `thumbnailUrl` varchar(1000) NULL DEFAULT NULL,
  `mimeType` varchar(100) NULL DEFAULT NULL,
  `sizeBytes` bigint NULL DEFAULT NULL,
  `width` int NULL DEFAULT NULL,
  `height` int NULL DEFAULT NULL,
  `duration` int NULL DEFAULT NULL,
  `isDeliverable` tinyint NOT NULL DEFAULT 0,
  `isPortfolio` tinyint NOT NULL DEFAULT 0,
  `tags` json NULL,
  `uploadedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_media_file_company` (`companyId`,`createdAt`),
  KEY `idx_bo_media_file_project` (`projectId`),
  KEY `idx_bo_media_file_portfolio` (`companyId`,`isPortfolio`),
  CONSTRAINT `fk_bo_media_file_project` FOREIGN KEY (`projectId`) REFERENCES `bo_media_projects` (`id`) ON DELETE SET NULL,
  KEY `idx_bo_media_files_uploadedById` (`uploadedById`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8) Paiements des clients
CREATE TABLE IF NOT EXISTS `bo_media_payments` (
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `projectId` varchar(36) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'USD',
  `method` enum('CASH','MOBILE_MONEY','FPAY','BANK_TRANSFER','CARD','OTHER') NOT NULL DEFAULT 'CASH',
  `reference` varchar(100) NULL DEFAULT NULL,
  `paidAt` datetime(6) NOT NULL,
  `note` varchar(500) NULL DEFAULT NULL,
  `receivedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_media_payment_project` (`projectId`),
  KEY `idx_bo_media_payment_company_date` (`companyId`,`paidAt`),
  CONSTRAINT `fk_bo_media_payment_project` FOREIGN KEY (`projectId`) REFERENCES `bo_media_projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9) Historique des projets
CREATE TABLE IF NOT EXISTS `bo_media_project_events` (
  `id` varchar(36) NOT NULL,
  `projectId` varchar(36) NOT NULL,
  `type` enum('CREATED','UPDATED','STATUS_CHANGED','ITEMS_UPDATED','SESSION_PLANNED','SESSION_UPDATED','CREW_ASSIGNED','CREW_REMOVED','EQUIPMENT_BOOKED','EQUIPMENT_RELEASED','FILE_ADDED','PAYMENT','SHARED','NOTE','SOCIAL_POST','SOCIAL_CAMPAIGN','VENDOR_ASSIGNED','VENDOR_UPDATED','VENDOR_PAYMENT') NOT NULL,
  `fromStatus` varchar(30) NULL DEFAULT NULL,
  `toStatus` varchar(30) NULL DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `payload` json NULL,
  `actorId` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_media_event_project_date` (`projectId`,`createdAt`),
  CONSTRAINT `fk_bo_media_event_project` FOREIGN KEY (`projectId`) REFERENCES `bo_media_projects` (`id`) ON DELETE CASCADE,
  KEY `idx_bo_media_project_events_actorId` (`actorId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10) Publications
CREATE TABLE IF NOT EXISTS `bo_media_publications` (
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `projectId` varchar(36) NULL DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `description` text NULL,
  `type` enum('PHOTO','VIDEO','AUDIO','TEXT','DOCUMENT','OTHER') NOT NULL DEFAULT 'PHOTO',
  `channels` json NULL,
  `coverUrl` varchar(500) NULL DEFAULT NULL,
  `mediaFileIds` json NULL,
  `status` enum('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `publishedAt` datetime(6) NULL DEFAULT NULL,
  `views` int NOT NULL DEFAULT 0,
  `likes` int NOT NULL DEFAULT 0,
  `comments` int NOT NULL DEFAULT 0,
  `shares` int NOT NULL DEFAULT 0,
  `lastStatsOn` date NULL DEFAULT NULL,
  `notes` varchar(1000) NULL DEFAULT NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_media_publication_company` (`companyId`,`status`,`publishedAt`),
  CONSTRAINT `fk_bo_media_publication_project` FOREIGN KEY (`projectId`) REFERENCES `bo_media_projects` (`id`) ON DELETE SET NULL,
  KEY `idx_bo_media_publications_createdById` (`createdById`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11) Chiffres des publications
CREATE TABLE IF NOT EXISTS `bo_media_publication_stats` (
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `publicationId` varchar(36) NOT NULL,
  `statDate` date NOT NULL,
  `views` int NOT NULL DEFAULT 0,
  `likes` int NOT NULL DEFAULT 0,
  `comments` int NOT NULL DEFAULT 0,
  `shares` int NOT NULL DEFAULT 0,
  `note` varchar(500) NULL DEFAULT NULL,
  `recordedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bo_media_publication_stat_day` (`publicationId`,`statDate`),
  KEY `idx_bo_media_publication_stat_company` (`companyId`,`statDate`),
  CONSTRAINT `fk_bo_media_publication_stat_publication` FOREIGN KEY (`publicationId`) REFERENCES `bo_media_publications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12) Prestataires externes (avec photo, domaines, conditions)
CREATE TABLE IF NOT EXISTS `bo_media_vendors` (
  `id`                varchar(36)   NOT NULL,
  `companyId`         varchar(36)   NOT NULL,
  `code`              varchar(20)   NOT NULL,
  `type`              enum('INDIVIDUAL','COMPANY') NOT NULL DEFAULT 'INDIVIDUAL',
  `name`              varchar(150)  NOT NULL,
  `photoUrl`          varchar(500)  NULL,
  `legalName`         varchar(200)  NULL,
  `contactName`       varchar(150)  NULL,
  `phone`             varchar(30)   NULL,
  `whatsapp`          varchar(30)   NULL,
  `email`             varchar(150)  NULL,
  `address`           varchar(255)  NULL,
  `city`              varchar(100)  NULL,
  `country`           varchar(100)  NULL,
  `userId`            varchar(36)   NULL,
  `domains`           json          NULL,
  `domainOther`       varchar(150)  NULL,
  `categories`        json          NULL,
  `roles`             json          NULL,
  `specialties`       varchar(500)  NULL,
  `equipment`         varchar(500)  NULL,
  `portfolioUrl`      varchar(500)  NULL,
  `socialLinks`       json          NULL,
  `languages`         json          NULL,
  `rateUnit`          enum('HOUR','DAY','SESSION','PROJECT','ITEM','MONTH') NULL,
  `rateAmount`        decimal(14,2) NULL,
  `currency`          varchar(10)   NOT NULL DEFAULT 'USD',
  `paymentMethod`     enum('CASH','MOBILE_MONEY','FPAY','BANK_TRANSFER','CARD','OTHER') NULL,
  `mobileMoneyNumber` varchar(30)   NULL,
  `bankName`          varchar(100)  NULL,
  `bankAccount`       varchar(60)   NULL,
  `taxId`             varchar(60)   NULL,
  `ndaSigned`         tinyint       NOT NULL DEFAULT 0,
  `contractStartDate` date          NULL,
  `contractEndDate`   date          NULL,
  `status`            enum('PROSPECT','ACTIVE','SUSPENDED','BLACKLISTED','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `statusReason`      varchar(500)  NULL,
  `statusChangedAt`   datetime(6)   NULL,
  `rating`            decimal(3,2)  NOT NULL DEFAULT 0,
  `ratingCount`       int           NOT NULL DEFAULT 0,
  `notes`             text          NULL,
  `conditions`        text          NULL,
  `createdById`       varchar(36)   NULL,
  `createdAt`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bo_media_vendor_code` (`companyId`,`code`),
  KEY `idx_bo_media_vendor_company_status` (`companyId`,`status`),
  KEY `idx_bo_media_vendor_name` (`companyId`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13) Dossier des prestataires
CREATE TABLE IF NOT EXISTS `bo_media_vendor_documents` (
  `id`           varchar(36)   NOT NULL,
  `companyId`    varchar(36)   NOT NULL,
  `vendorId`     varchar(36)   NOT NULL,
  `type`         enum('ID_CARD','CONTRACT','NDA','TAX_CERTIFICATE','INSURANCE','INVOICE','PORTFOLIO','OTHER') NOT NULL DEFAULT 'OTHER',
  `title`        varchar(200)  NOT NULL,
  `url`          varchar(1000) NOT NULL,
  `mimeType`     varchar(100)  NULL,
  `sizeBytes`    bigint        NULL,
  `expiresAt`    date          NULL,
  `note`         varchar(500)  NULL,
  `uploadedById` varchar(36)   NULL,
  `createdAt`    datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_media_vendor_doc_vendor` (`vendorId`),
  KEY `idx_bo_media_vendor_doc_expiry` (`companyId`,`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14) Missions des prestataires
CREATE TABLE IF NOT EXISTS `bo_media_vendor_assignments` (
  `id`            varchar(36)   NOT NULL,
  `companyId`     varchar(36)   NOT NULL,
  `vendorId`      varchar(36)   NOT NULL,
  `projectId`     varchar(36)   NOT NULL,
  `sessionId`     varchar(36)   NULL,
  `role`          enum('PHOTOGRAPHER','VIDEOGRAPHER','DRONE_PILOT','EDITOR','DESIGNER','COMMUNITY_MANAGER','DIRECTOR','ASSISTANT','OTHER') NOT NULL DEFAULT 'OTHER',
  `category`      enum('PHOTOGRAPHY','VIDEOGRAPHY','DRONE','LIVE_STREAMING','EDITING','GRAPHIC_DESIGN','SOCIAL_MEDIA','WEB_DIGITAL','PRINTING','OTHER') NULL,
  `description`   varchar(1000) NULL,
  `startAt`       datetime(6)   NULL,
  `endAt`         datetime(6)   NULL,
  `dueAt`         datetime(6)   NULL,
  `quantity`      decimal(10,2) NOT NULL DEFAULT 1,
  `unit`          enum('HOUR','DAY','SESSION','PROJECT','ITEM','MONTH') NOT NULL DEFAULT 'SESSION',
  `unitCost`      decimal(14,2) NOT NULL DEFAULT 0,
  `amount`        decimal(14,2) NOT NULL DEFAULT 0,
  `currency`      varchar(10)   NOT NULL DEFAULT 'USD',
  `amountPaid`    decimal(14,2) NOT NULL DEFAULT 0,
  `paymentStatus` enum('UNPAID','PARTIAL','PAID','NOT_APPLICABLE') NOT NULL DEFAULT 'UNPAID',
  `status`        enum('PROPOSED','CONFIRMED','IN_PROGRESS','DELIVERED','VALIDATED','CANCELLED') NOT NULL DEFAULT 'PROPOSED',
  `confirmedAt`   datetime(6)   NULL,
  `deliveredAt`   datetime(6)   NULL,
  `validatedAt`   datetime(6)   NULL,
  `cancelledAt`   datetime(6)   NULL,
  `cancelReason`  varchar(500)  NULL,
  `deliveryUrl`   varchar(1000) NULL,
  `rating`        tinyint       NULL,
  `ratingDetails` json          NULL,
  `review`        varchar(1000) NULL,
  `note`          varchar(500)  NULL,
  `createdById`   varchar(36)   NULL,
  `createdAt`     datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`     datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_media_va_vendor_period` (`vendorId`,`startAt`),
  KEY `idx_bo_media_va_project` (`projectId`),
  KEY `idx_bo_media_va_company_status` (`companyId`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15) Paiements des prestataires
CREATE TABLE IF NOT EXISTS `bo_media_vendor_payments` (
  `id`           varchar(36)   NOT NULL,
  `companyId`    varchar(36)   NOT NULL,
  `vendorId`     varchar(36)   NOT NULL,
  `assignmentId` varchar(36)   NOT NULL,
  `projectId`    varchar(36)   NOT NULL,
  `amount`       decimal(14,2) NOT NULL,
  `currency`     varchar(10)   NOT NULL DEFAULT 'USD',
  `method`       enum('CASH','MOBILE_MONEY','FPAY','BANK_TRANSFER','CARD','OTHER') NOT NULL DEFAULT 'CASH',
  `reference`    varchar(100)  NULL,
  `receiptUrl`   varchar(1000) NULL,
  `paidAt`       datetime(6)   NOT NULL,
  `note`         varchar(500)  NULL,
  `paidById`     varchar(36)   NULL,
  `createdAt`    datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_media_vp_assignment` (`assignmentId`),
  KEY `idx_bo_media_vp_vendor_date` (`vendorId`,`paidAt`),
  KEY `idx_bo_media_vp_company_date` (`companyId`,`paidAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16) Prestations et tarifs des prestataires
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

-- Contrôle
SELECT
  (SELECT COUNT(*) FROM `bo_media_projects`) AS projets,
  (SELECT COUNT(*) FROM `bo_media_vendors`) AS prestataires,
  (SELECT COUNT(*) FROM `bo_media_vendor_rates`) AS prestations;
