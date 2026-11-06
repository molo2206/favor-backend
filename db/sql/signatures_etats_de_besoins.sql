-- =====================================================================================
-- ✅ SIGNATURES : image de signature des utilisateurs + signatures apposées sur les états de besoins
--    Base favor_db : sélectionner favor_db dans phpMyAdmin avant d'exécuter.
--    2 NOUVELLES tables, aucune table existante modifiée. Ré-exécutable. Sans information_schema.
--    Migration équivalente : db/migrations/1795996800000-Signatures.ts
-- =====================================================================================

-- Signature de chaque utilisateur / employé (une par utilisateur)
CREATE TABLE IF NOT EXISTS `user_signatures` (
  `id`          varchar(36)  NOT NULL,
  `userId`      varchar(36)  NOT NULL,
  `imageUrl`    varchar(500) NOT NULL,
  `storagePath` varchar(300) NOT NULL,
  `width`       int          NULL,
  `height`      int          NULL,
  `sizeBytes`   int          NULL,
  `source`      varchar(10)  NOT NULL DEFAULT 'UPLOAD' COMMENT 'UPLOAD | DRAWN',
  `updatedById` varchar(36)  NULL,
  `createdAt`   datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`   datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_signature_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Signatures apposées sur les états de besoins (copie de l'image au moment de la signature)
CREATE TABLE IF NOT EXISTS `bo_need_signatures` (
  `id`           varchar(36)  NOT NULL,
  `needId`       varchar(36)  NOT NULL,
  `companyId`    varchar(36)  NOT NULL,
  `userId`       varchar(36)  NOT NULL,
  `signerName`   varchar(150) NULL,
  `role`         varchar(20)  NOT NULL COMMENT 'REQUESTER | VALIDATOR | FINANCE | CASHIER',
  `action`       varchar(30)  NOT NULL,
  `level`        int          NULL,
  `levelName`    varchar(150) NULL,
  `refId`        varchar(36)  NULL,
  `signatureUrl` varchar(500) NULL,
  `signedAt`     datetime(6)  NOT NULL,
  `createdAt`    datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_bo_need_sig_need` (`needId`, `signedAt`),
  KEY `idx_bo_need_sig_ref` (`refId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vérification
SHOW TABLES LIKE 'user_signatures';
SHOW TABLES LIKE 'bo_need_signatures';
