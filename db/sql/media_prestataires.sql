-- =====================================================================
-- MÉDIA — PRESTATAIRES EXTERNES (freelances, studios, agences…) — base favor_db
-- Nouvelles tables uniquement + nouveaux types d'historique. Aucune donnée existante modifiée.
-- Pas d'information_schema. Exécution : phpMyAdmin → favor_db → SQL.
-- =====================================================================

-- 1) Tables
CREATE TABLE IF NOT EXISTS `bo_media_vendors` (
  `id`                varchar(36)   NOT NULL,
  `companyId`         varchar(36)   NOT NULL,
  `code`              varchar(20)   NOT NULL,
  `type`              enum('INDIVIDUAL','COMPANY') NOT NULL DEFAULT 'INDIVIDUAL',
  `name`              varchar(150)  NOT NULL,
  `legalName`         varchar(200)  NULL,
  `contactName`       varchar(150)  NULL,
  `phone`             varchar(30)   NULL,
  `whatsapp`          varchar(30)   NULL,
  `email`             varchar(150)  NULL,
  `address`           varchar(255)  NULL,
  `city`              varchar(100)  NULL,
  `country`           varchar(100)  NULL,
  `userId`            varchar(36)   NULL,
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
  `createdById`       varchar(36)   NULL,
  `createdAt`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bo_media_vendor_code` (`companyId`,`code`),
  KEY `idx_bo_media_vendor_company_status` (`companyId`,`status`),
  KEY `idx_bo_media_vendor_name` (`companyId`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- 2) Historique des projets : nouveaux types (prestataires) + SOCIAL_POST / SOCIAL_CAMPAIGN
--    (ces deux derniers manquaient : l'historique des publications n'était pas enregistré)
ALTER TABLE `bo_media_project_events` MODIFY COLUMN `type` enum('CREATED','UPDATED','STATUS_CHANGED','ITEMS_UPDATED','SESSION_PLANNED','SESSION_UPDATED','CREW_ASSIGNED','CREW_REMOVED','EQUIPMENT_BOOKED','EQUIPMENT_RELEASED','FILE_ADDED','PAYMENT','SHARED','NOTE','SOCIAL_POST','SOCIAL_CAMPAIGN','VENDOR_ASSIGNED','VENDOR_UPDATED','VENDOR_PAYMENT') NOT NULL;

-- 3) Contrôle
SELECT COUNT(*) AS prestataires FROM `bo_media_vendors`;
