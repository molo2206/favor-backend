-- ============================================================
-- ✅ Gestionnaire de fichiers : corbeille (fichiers supprimés restaurables 30 jours)
-- Base : favor_db — à exécuter une seule fois
-- ============================================================
CREATE TABLE IF NOT EXISTS `file_trash` (
  `id`            varchar(36)  NOT NULL,
  `rootId`        varchar(30)  NOT NULL,
  `originalPath`  varchar(700) NOT NULL,
  `trashPath`     varchar(700) NOT NULL,
  `isDirectory`   tinyint      NOT NULL DEFAULT 0,
  `sizeBytes`     bigint       NOT NULL DEFAULT 0,
  `reason`        varchar(30)  NOT NULL DEFAULT 'MANUAL',
  `context`       varchar(300) NULL,
  `deletedById`   varchar(36)  NULL,
  `deletedByName` varchar(150) NULL,
  `createdAt`     datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `expiresAt`     datetime     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_file_trash_created` (`createdAt`),
  KEY `idx_file_trash_expires` (`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SHOW TABLES LIKE 'file_trash';
