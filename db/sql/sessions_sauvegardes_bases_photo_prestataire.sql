-- =====================================================================
-- 1) SESSIONS DE CONNEXION  2) SAUVEGARDES LIÉES AUX BASES MYSQL  3) PHOTO DU PRESTATAIRE (Médias)
-- Base favor_db. Aucune donnée existante modifiée ni supprimée. Pas d'information_schema.
-- Exécution : phpMyAdmin → favor_db → SQL.
--   #1060 « Duplicate column name » / #1061 « Duplicate key name » : déjà fait → exécutez les lignes suivantes.
-- La base de l'application est ajoutée automatiquement comme base sauvegardée par défaut au démarrage du backend
-- (et les anciennes sauvegardes / programmations y sont rattachées).
-- =====================================================================

-- 1) Sessions de connexion
CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id`                  varchar(36)  NOT NULL,
  `userId`              varchar(36)  NOT NULL,
  `loginMethod`         varchar(20)  NOT NULL DEFAULT 'PASSWORD',
  `ipAddress`           varchar(45)  NULL,
  `userAgent`           varchar(500) NULL,
  `platform`            varchar(20)  NULL,
  `deviceId`            varchar(150) NULL,
  `deviceName`          varchar(150) NULL,
  `appVersion`          varchar(30)  NULL,
  `refreshTokenHash`    varchar(64)  NULL,
  `previousRefreshHash` varchar(64)  NULL,
  `refreshRotatedAt`    datetime     NULL,
  `createdAt`           datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `lastActiveAt`        datetime     NOT NULL,
  `expiresAt`           datetime     NOT NULL,
  `revokedAt`           datetime     NULL,
  `revokedReason`       varchar(30)  NULL,
  `revokedNote`         varchar(200) NULL,
  `revokedById`         varchar(36)  NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_sessions_user` (`userId`, `revokedAt`),
  KEY `idx_user_sessions_expires` (`expiresAt`),
  KEY `idx_user_sessions_last` (`lastActiveAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Bases MySQL à sauvegarder
CREATE TABLE IF NOT EXISTS `backup_databases` (
  `id`                varchar(36)   NOT NULL,
  `name`              varchar(120)  NOT NULL,
  `description`       varchar(500)  NULL,
  `useAppCredentials` tinyint       NOT NULL DEFAULT 0,
  `host`              varchar(255)  NULL,
  `port`              int           NULL,
  `username`          varchar(100)  NULL,
  `passwordEnc`       text          NULL,
  `databaseName`      varchar(64)   NOT NULL,
  `excludeTables`     text          NULL,
  `isDefault`         tinyint       NOT NULL DEFAULT 0,
  `isActive`          tinyint       NOT NULL DEFAULT 1,
  `lastTestAt`        datetime      NULL,
  `lastTestOk`        tinyint       NULL,
  `lastTestError`     varchar(1000) NULL,
  `serverVersion`     varchar(100)  NULL,
  `lastBackupAt`      datetime      NULL,
  `lastBackupStatus`  varchar(20)   NULL,
  `createdById`       varchar(36)   NULL,
  `createdAt`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_backup_databases_active` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Tables des sauvegardes (créées complètes si elles n'existent pas encore)
CREATE TABLE IF NOT EXISTS `backup_schedules` (
  `id`             varchar(36)  NOT NULL,
  `name`           varchar(120) NOT NULL,
  `times`          text         NOT NULL COMMENT 'JSON ["02:00","14:00"] (heures locales)',
  `days`           text         NULL     COMMENT 'JSON [1..7] 1 = lundi ; NULL = tous les jours',
  `timezone`       varchar(60)  NOT NULL DEFAULT 'Africa/Lubumbashi',
  `keepLast`       int          NOT NULL DEFAULT 14,
  `includeUploads` tinyint      NOT NULL DEFAULT 0,
  `isActive`       tinyint      NOT NULL DEFAULT 1,
  `databaseId`     varchar(36)  NULL,
  `lastSlot`       varchar(20)  NULL,
  `lastRunAt`      datetime     NULL,
  `lastStatus`     varchar(20)  NULL,
  `createdById`    varchar(36)  NULL,
  `createdAt`      datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`      datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backup_runs` (
  `id`               varchar(36)  NOT NULL,
  `scheduleId`       varchar(36)  NULL,
  `trigger`          varchar(20)  NOT NULL DEFAULT 'MANUAL',
  `databaseId`       varchar(36)  NULL,
  `databaseLabel`    varchar(200) NULL,
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
  KEY `idx_backup_runs_schedule` (`scheduleId`, `status`),
  KEY `idx_backup_runs_database` (`databaseId`, `startedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Programmation par défaut : tous les jours à 02:00 (heure de Goma), 14 sauvegardes gardées
INSERT INTO `backup_schedules` (`id`, `name`, `times`, `days`, `timezone`, `keepLast`, `includeUploads`, `isActive`)
SELECT UUID(), 'Sauvegarde quotidienne', '["02:00"]', NULL, 'Africa/Lubumbashi', 14, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM `backup_schedules`);

-- 4) Photo du prestataire
ALTER TABLE `bo_media_vendors` ADD COLUMN `photoUrl` varchar(500) NULL;

-- 5) SEULEMENT si backup_schedules / backup_runs existaient AVANT ce script (sinon ignorez ces lignes : #1060)
-- ALTER TABLE `backup_schedules` ADD COLUMN `databaseId` varchar(36) NULL;
-- ALTER TABLE `backup_runs` ADD COLUMN `databaseId` varchar(36) NULL;
-- ALTER TABLE `backup_runs` ADD COLUMN `databaseLabel` varchar(200) NULL;
-- CREATE INDEX `idx_backup_runs_database` ON `backup_runs` (`databaseId`, `startedAt`);

-- 6) Contrôle
SELECT (SELECT COUNT(*) FROM `user_sessions`) AS sessions, (SELECT COUNT(*) FROM `backup_databases`) AS bases_sauvegardees, (SELECT COUNT(*) FROM `backup_schedules`) AS programmations;
