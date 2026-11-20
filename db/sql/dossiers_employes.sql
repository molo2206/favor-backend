-- =====================================================================================
-- ✅ RH : DOSSIERS DES EMPLOYÉS (CV, pièces d'identité, diplômes, contrats, certificats…)
--    Base favor_db : sélectionner favor_db dans phpMyAdmin avant d'exécuter.
--    1 NOUVELLE table, aucune table existante modifiée. Ré-exécutable. Sans information_schema.
--    Migration équivalente : db/migrations/1796169600000-EmployeeDocuments.ts
-- =====================================================================================

CREATE TABLE IF NOT EXISTS `hr_employee_documents` (
  `id`             varchar(36)   NOT NULL,
  `employeeId`     varchar(36)   NOT NULL COMMENT 'hr_employees.id',
  `companyId`      varchar(36)   NULL,
  `category`       varchar(30)   NOT NULL DEFAULT 'OTHER' COMMENT 'CV | ID_CARD | PASSPORT | DIPLOMA | CONTRACT | CERTIFICATE | MEDICAL | CRIMINAL_RECORD | BANK | PHOTO | DRIVING_LICENSE | OTHER',
  `title`          varchar(200)  NOT NULL,
  `description`    varchar(1000) NULL,
  `documentNumber` varchar(100)  NULL,
  `issuedAt`       date          NULL,
  `expiresAt`      date          NULL,
  `storagePath`    varchar(300)  NOT NULL COMMENT 'Chemin relatif dans HR_DOCUMENTS_PATH (dossier privé)',
  `originalName`   varchar(255)  NOT NULL,
  `mimeType`       varchar(120)  NOT NULL,
  `sizeBytes`      int           NOT NULL,
  `uploadedById`   varchar(36)   NULL,
  `uploadedByName` varchar(150)  NULL,
  `createdAt`      datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`      datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_hr_emp_doc_employee` (`employeeId`, `category`),
  KEY `idx_hr_emp_doc_company_exp` (`companyId`, `expiresAt`),
  CONSTRAINT `fk_hr_emp_doc_employee` FOREIGN KEY (`employeeId`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vérification
SHOW TABLES LIKE 'hr_employee_documents';
