-- =====================================================================
-- Service client : objectifs de contact (critères + périodicité) +
-- disponibilisation LTA + suivi dynamique des contacts clients.
-- À exécuter une fois.
-- =====================================================================

-- 1) Colonnes de disponibilisation sur la LTA (ADD COLUMN : exécuter UNE seule fois)
ALTER TABLE `lta`
  ADD COLUMN `availableToServiceClient`     TINYINT(1)  NOT NULL DEFAULT 0,
  ADD COLUMN `releasedToServiceClientById`  VARCHAR(36) NULL,
  ADD COLUMN `releasedToServiceClientAt`    TIMESTAMP   NULL;

-- 2) Objectifs du service client
CREATE TABLE IF NOT EXISTS `service_client_objectives` (
  `id`          VARCHAR(36)  NOT NULL,
  `name`        VARCHAR(150) NOT NULL,
  `description` VARCHAR(500) NULL,
  `filters`     JSON         NULL,
  `periodicity` ENUM('ONCE','DAILY','WEEKLY','MONTHLY') NOT NULL DEFAULT 'WEEKLY',
  `targetCount` INT          NOT NULL DEFAULT 0,
  `isActive`    TINYINT(1)   NOT NULL DEFAULT 1,
  `createdById` VARCHAR(36)  NULL,
  `createdAt`   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_sco_active` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Suivi des contacts (scopé par objectif + période)
CREATE TABLE IF NOT EXISTS `service_client_contacts` (
  `id`             VARCHAR(36)  NOT NULL,
  `clientUserId`   VARCHAR(36)  NOT NULL,
  `refType`        ENUM('LTA','ORDER','RIDE','TRIP','VEHICLE_RESERVATION','HOTEL_RESERVATION','GENERAL') NOT NULL DEFAULT 'GENERAL',
  `refId`          VARCHAR(36)  NOT NULL DEFAULT '',
  `objectiveId`    VARCHAR(36)  NOT NULL DEFAULT '',
  `periodKey`      VARCHAR(20)  NOT NULL DEFAULT '',
  `contacted`      TINYINT(1)   NOT NULL DEFAULT 1,
  `note`           TEXT         NULL,
  `contactedById`  VARCHAR(36)  NOT NULL,
  `contactedAt`    DATETIME(6)  NULL,
  `createdAt`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_scc_client_ref` (`clientUserId`,`refType`,`refId`,`objectiveId`,`periodKey`),
  KEY `idx_scc_client` (`clientUserId`),
  KEY `idx_scc_ref` (`refType`,`refId`),
  KEY `idx_scc_objective_period` (`objectiveId`,`periodKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
