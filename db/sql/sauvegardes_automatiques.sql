-- =====================================================================================
-- ✅ Sauvegardes automatiques programmables (module backup)
--    2 NOUVELLES tables, aucune table existante modifiée.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS `backup_schedules` (
  `id`             varchar(36)  NOT NULL,
  `name`           varchar(120) NOT NULL,
  `times`          text         NOT NULL COMMENT 'JSON ["02:00","14:00"] (heures locales)',
  `days`           text         NULL     COMMENT 'JSON [1..7] 1 = lundi ; NULL = tous les jours',
  `timezone`       varchar(60)  NOT NULL DEFAULT 'Africa/Lubumbashi',
  `keepLast`       int          NOT NULL DEFAULT 14,
  `includeUploads` tinyint      NOT NULL DEFAULT 0,
  `isActive`       tinyint      NOT NULL DEFAULT 1,
  `lastSlot`       varchar(20)  NULL,
  `lastRunAt`      datetime     NULL,
  `lastStatus`     varchar(20)  NULL,
  `createdById`    varchar(36)  NULL,
  `createdAt`      datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`      datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `backup_runs` (
  `id`               varchar(36)  NOT NULL,
  `scheduleId`       varchar(36)  NULL,
  `trigger`          varchar(20)  NOT NULL DEFAULT 'MANUAL',
  `status`           varchar(20)  NOT NULL DEFAULT 'RUNNING',
  `fileName`         varchar(190) NULL,
  `sizeBytes`        bigint       NULL,
  `uploadsFileName`  varchar(190) NULL,
  `uploadsSizeBytes` bigint       NULL,
  `durationMs`       int          NULL,
  `error`            text         NULL,
  `deleted`          tinyint      NOT NULL DEFAULT 0,
  `createdById`      varchar(36)  NULL,
  `startedAt`        datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `finishedAt`       datetime     NULL,
  PRIMARY KEY (`id`),
  KEY `idx_backup_runs_started` (`startedAt`),
  KEY `idx_backup_runs_schedule` (`scheduleId`, `status`)
) ENGINE=InnoDB;

-- Programmation par défaut : tous les jours à 02:00 (heure de Goma), 14 sauvegardes gardées
INSERT INTO `backup_schedules` (`id`, `name`, `times`, `days`, `timezone`, `keepLast`, `includeUploads`, `isActive`)
SELECT UUID(), 'Sauvegarde quotidienne', '["02:00"]', NULL, 'Africa/Lubumbashi', 14, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM `backup_schedules`);
