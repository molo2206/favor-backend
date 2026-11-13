-- =====================================================================================
-- ✅ BackOffice — ÉTATS DE BESOINS (base favor_db : sélectionner favor_db dans phpMyAdmin)
--    7 NOUVELLES tables, aucune table existante modifiée. Ré-exécutable (CREATE TABLE IF NOT EXISTS).
--    Migration équivalente : db/migrations/1795219200000-NeedsRequests.ts
-- =====================================================================================

CREATE TABLE IF NOT EXISTS `bo_need_requests` (
  `id`                 varchar(36)   NOT NULL,
  `companyId`          varchar(36)   NOT NULL,
  `reference`          varchar(40)   NOT NULL,
  `requesterId`        varchar(36)   NOT NULL,
  `requesterName`      varchar(150)  NULL,
  `departmentId`       varchar(36)   NULL,
  `departmentName`     varchar(150)  NULL,
  `title`              varchar(200)  NOT NULL,
  `description`        text          NULL,
  `category`           varchar(40)   NOT NULL,
  `priority`           varchar(15)   NOT NULL DEFAULT 'NORMAL',
  `justification`      text          NULL,
  `neededBy`           date          NULL,
  `currency`           varchar(10)   NOT NULL DEFAULT 'USD',
  `estimatedTotal`     decimal(14,2) NOT NULL DEFAULT 0,
  `estimatedTotalUsd`  decimal(14,2) NULL,
  `status`             varchar(25)   NOT NULL DEFAULT 'DRAFT',
  `ruleId`             varchar(36)   NULL,
  `ruleName`           varchar(120)  NULL,
  `levels`             json          NULL,
  `currentLevel`       int           NOT NULL DEFAULT 0,
  `levelStartedAt`     datetime(6)   NULL,
  `allowSelfApproval`  tinyint       NOT NULL DEFAULT 0,
  `approvedAmount`     decimal(14,2) NULL,
  `submissions`        int           NOT NULL DEFAULT 0,
  `submittedAt`        datetime(6)   NULL,
  `firstSubmittedAt`   datetime(6)   NULL,
  `validatedAt`        datetime(6)   NULL,
  `rejectedAt`         datetime(6)   NULL,
  `rejectionReason`    varchar(1000) NULL,
  `correctionLevel`    int           NULL,
  `correctionMessage`  varchar(1000) NULL,
  `cancelledAt`        datetime(6)   NULL,
  `cancelReason`       varchar(500)  NULL,
  `financeStatus`      varchar(20)   NOT NULL DEFAULT 'NONE',
  `transmittedAt`      datetime(6)   NULL,
  `authorizedAmount`   decimal(14,2) NULL,
  `authorizedById`     varchar(36)   NULL,
  `authorizedAt`       datetime(6)   NULL,
  `authorizationNote`  varchar(1000) NULL,
  `disbursedTotal`     decimal(14,2) NOT NULL DEFAULT 0,
  `lastDisbursedAt`    date          NULL,
  `executionStatus`    varchar(15)   NOT NULL DEFAULT 'NOT_STARTED',
  `executionRate`      int           NOT NULL DEFAULT 0,
  `executionNote`      varchar(1000) NULL,
  `executedAt`         datetime(6)   NULL,
  `version`            int           NOT NULL DEFAULT 1,
  `createdAt`          datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`          datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bo_need_ref` (`reference`),
  KEY `idx_bo_need_company_status` (`companyId`, `status`),
  KEY `idx_bo_need_requester` (`requesterId`),
  KEY `idx_bo_need_department` (`departmentId`),
  KEY `idx_bo_need_finance` (`companyId`, `financeStatus`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bo_need_items` (
  `id`               varchar(36)   NOT NULL,
  `needId`           varchar(36)   NOT NULL,
  `position`         int           NOT NULL DEFAULT 0,
  `designation`      varchar(255)  NOT NULL,
  `description`      varchar(1000) NULL,
  `unit`             varchar(30)   NULL,
  `quantity`         decimal(12,2) NOT NULL,
  `unitPrice`        decimal(14,2) NOT NULL DEFAULT 0,
  `total`            decimal(14,2) NOT NULL DEFAULT 0,
  `executedQuantity` decimal(12,2) NOT NULL DEFAULT 0,
  `createdAt`        datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_need_items_need` (`needId`, `position`),
  CONSTRAINT `fk_bo_need_items_need` FOREIGN KEY (`needId`) REFERENCES `bo_need_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bo_need_attachments` (
  `id`             varchar(36)  NOT NULL,
  `needId`         varchar(36)  NOT NULL,
  `kind`           varchar(20)  NOT NULL DEFAULT 'OTHER',
  `url`            varchar(500) NOT NULL,
  `name`           varchar(255) NULL,
  `mimeType`       varchar(100) NULL,
  `size`           int          NULL,
  `disbursementId` varchar(36)  NULL,
  `uploadedById`   varchar(36)  NULL,
  `createdAt`      datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_need_att_need` (`needId`),
  CONSTRAINT `fk_bo_need_att_need` FOREIGN KEY (`needId`) REFERENCES `bo_need_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bo_need_disbursements` (
  `id`                varchar(36)   NOT NULL,
  `needId`            varchar(36)   NOT NULL,
  `amount`            decimal(14,2) NOT NULL,
  `currency`          varchar(10)   NOT NULL,
  `paidAt`            date          NOT NULL,
  `paidById`          varchar(36)   NULL,
  `paidByName`        varchar(150)  NULL,
  `beneficiary`       varchar(150)  NULL,
  `paymentMethod`     varchar(20)   NULL,
  `paymentReference`  varchar(100)  NULL,
  `note`              varchar(1000) NULL,
  `cashTransactionId` varchar(36)   NULL,
  `cashAccountId`     varchar(36)   NULL,
  `recordedById`      varchar(36)   NULL,
  `createdAt`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_need_disb_need` (`needId`),
  CONSTRAINT `fk_bo_need_disb_need` FOREIGN KEY (`needId`) REFERENCES `bo_need_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bo_need_logs` (
  `id`         varchar(36)  NOT NULL,
  `needId`     varchar(36)  NOT NULL,
  `action`     varchar(30)  NOT NULL,
  `level`      int          NOT NULL DEFAULT 0,
  `userId`     varchar(36)  NULL,
  `userName`   varchar(150) NULL,
  `fromStatus` varchar(25)  NULL,
  `toStatus`   varchar(25)  NULL,
  `comment`    text         NULL,
  `payload`    json         NULL,
  `ip`         varchar(64)  NULL,
  `createdAt`  datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_need_logs_need` (`needId`, `createdAt`),
  KEY `idx_bo_need_logs_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bo_need_rules` (
  `id`                varchar(36)   NOT NULL,
  `companyId`         varchar(36)   NOT NULL,
  `name`              varchar(120)  NOT NULL,
  `description`       varchar(500)  NULL,
  `departmentIds`     json          NULL,
  `categories`        json          NULL,
  `priorities`        json          NULL,
  `minAmount`         decimal(14,2) NOT NULL DEFAULT 0,
  `maxAmount`         decimal(14,2) NULL,
  `currency`          varchar(10)   NOT NULL DEFAULT 'USD',
  `levels`            json          NOT NULL,
  `allowSelfApproval` tinyint       NOT NULL DEFAULT 0,
  `slaHours`          int           NULL,
  `priority`          int           NOT NULL DEFAULT 0,
  `isActive`          tinyint       NOT NULL DEFAULT 1,
  `createdById`       varchar(36)   NULL,
  `createdAt`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_need_rules_company` (`companyId`, `isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bo_need_members` (
  `id`               varchar(36) NOT NULL,
  `companyId`        varchar(36) NOT NULL,
  `userId`           varchar(36) NOT NULL,
  `role`             varchar(10) NULL,
  `unavailableFrom`  datetime    NULL,
  `unavailableUntil` datetime    NULL,
  `delegateId`       varchar(36) NULL,
  `createdById`      varchar(36) NULL,
  `createdAt`        datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`        datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bo_need_member` (`companyId`, `userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vérification : 7 tables attendues
SHOW TABLES LIKE 'bo_need_%';
