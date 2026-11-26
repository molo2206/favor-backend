-- =====================================================================================
-- ✅ HORAIRES ET PROGRAMMES DE TRAVAIL DES UTILISATEURS
--    Base favor_db : sélectionner favor_db dans phpMyAdmin avant d'exécuter.
--    3 NOUVELLES tables + 1 ressource de permission. Aucune table existante modifiée.
--    Ré-exécutable sans risque. Sans accès à information_schema.
--    Migration équivalente : db/migrations/1795910400000-WorkSchedules.ts
--
--    Tant qu'aucun programme n'est créé, rien ne change : l'accès reste libre pour tout le monde.
-- =====================================================================================

-- Programmes : userId NULL = programme de l'entreprise ; userId rempli = programme individuel
CREATE TABLE IF NOT EXISTS `work_schedules` (
  `id`            varchar(36)  NOT NULL,
  `companyId`     varchar(36)  NOT NULL,
  `userId`        varchar(36)  NULL,
  `scopeKey`      varchar(36)  NOT NULL COMMENT 'userId ou COMPANY',
  `name`          varchar(120) NOT NULL,
  `timezone`      varchar(64)  NULL COMMENT 'Fuseau IANA ; vide = fuseau de l entreprise',
  `isActive`      tinyint      NOT NULL DEFAULT 1,
  `graceMinutes`  int          NOT NULL DEFAULT 0,
  `applyToOwners` tinyint      NOT NULL DEFAULT 0,
  `isLocked`      tinyint      NOT NULL DEFAULT 0 COMMENT 'Verrouillé par un Super Admin',
  `validFrom`     date         NULL,
  `validUntil`    date         NULL,
  `notes`         varchar(500) NULL,
  `createdById`   varchar(36)  NULL,
  `updatedById`   varchar(36)  NULL,
  `createdAt`     datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`     datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_work_schedule_scope` (`companyId`, `scopeKey`),
  KEY `idx_work_schedule_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Plages horaires : dayOfWeek 1 = lundi … 7 = dimanche ; fin <= début = se termine le lendemain
CREATE TABLE IF NOT EXISTS `work_schedule_slots` (
  `id`         varchar(36) NOT NULL,
  `scheduleId` varchar(36) NOT NULL,
  `dayOfWeek`  tinyint     NOT NULL,
  `startTime`  char(5)     NOT NULL,
  `endTime`    char(5)     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_work_schedule_slot_schedule` (`scheduleId`, `dayOfWeek`),
  CONSTRAINT `fk_work_schedule_slot_schedule` FOREIGN KEY (`scheduleId`) REFERENCES `work_schedules` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dérogations exceptionnelles (autorisations temporaires)
CREATE TABLE IF NOT EXISTS `work_schedule_exceptions` (
  `id`           varchar(36)  NOT NULL,
  `companyId`    varchar(36)  NOT NULL,
  `userId`       varchar(36)  NOT NULL,
  `startsAt`     datetime(6)  NOT NULL,
  `endsAt`       datetime(6)  NOT NULL,
  `reason`       varchar(500) NOT NULL,
  `createdById`  varchar(36)  NULL,
  `revokedAt`    datetime(6)  NULL,
  `revokedById`  varchar(36)  NULL,
  `revokeReason` varchar(500) NULL,
  `createdAt`    datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_work_schedule_exc_user` (`userId`, `companyId`, `endsAt`),
  KEY `idx_work_schedule_exc_company` (`companyId`, `startsAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ressource de permission : donner can_manage (ou can_update) aux responsables RH / managers
INSERT INTO `resources` (`id`, `name`, `label`, `description`, `status`, `deleted`, `createdAt`, `updatedAt`)
SELECT UUID(), 'WORK_SCHEDULES', 'Horaires de travail', 'Programmes de travail des utilisateurs et dérogations', 1, 0, NOW(6), NOW(6)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `resources` WHERE `name` = 'WORK_SCHEDULES');

-- Vérification
SHOW TABLES LIKE 'work_schedule%';
SELECT `id`, `name`, `label` FROM `resources` WHERE `name` = 'WORK_SCHEDULES';
