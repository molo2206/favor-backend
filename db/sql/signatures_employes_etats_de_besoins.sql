-- =====================================================================================
-- ✅ SIGNATURES DES EMPLOYÉS (hr_employees) + signatures apposées sur les états de besoins
--    Base favor_db : sélectionner favor_db dans phpMyAdmin avant d'exécuter.
--    Nouvelles tables, aucune table existante modifiée. Ré-exécutable. Sans information_schema.
--    Migration équivalente : db/migrations/1795996800000-EmployeeSignatures.ts
-- =====================================================================================

-- Signature de chaque employé (une par fiche employé)
CREATE TABLE IF NOT EXISTS `hr_employee_signatures` (
  `id`          varchar(36)  NOT NULL,
  `employeeId`  varchar(36)  NOT NULL COMMENT 'hr_employees.id',
  `companyId`   varchar(36)  NULL,
  `userId`      varchar(36)  NULL COMMENT 'hr_employees.userId (compte lié)',
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
  UNIQUE KEY `uq_hr_employee_signature` (`employeeId`),
  KEY `idx_hr_employee_signature_user` (`userId`, `companyId`),
  CONSTRAINT `fk_hr_employee_signature_employee` FOREIGN KEY (`employeeId`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Signatures apposées sur les états de besoins (copie de l'image au moment de la signature)
CREATE TABLE IF NOT EXISTS `bo_need_signatures` (
  `id`           varchar(36)  NOT NULL,
  `needId`       varchar(36)  NOT NULL,
  `companyId`    varchar(36)  NOT NULL,
  `userId`       varchar(36)  NOT NULL,
  `employeeId`   varchar(36)  NULL COMMENT 'hr_employees.id du signataire',
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

-- Si bo_need_signatures avait déjà été créée avec l'ancien script : ajout de la colonne employeeId
-- (#1060 « colonne déjà présente » : ignorer)
ALTER TABLE `bo_need_signatures` ADD COLUMN `employeeId` varchar(36) NULL AFTER `userId`;

-- Ancienne table (signature liée au compte utilisateur), remplacée par hr_employee_signatures.
-- Si vous l'aviez créée et qu'elle est vide, vous pouvez la supprimer :
-- DROP TABLE IF EXISTS `user_signatures`;

-- Vérification
SHOW TABLES LIKE 'hr_employee_signatures';
SHOW TABLES LIKE 'bo_need_signatures';
