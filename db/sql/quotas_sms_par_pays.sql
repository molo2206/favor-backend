-- =====================================================================
-- Quotas SMS par pays — liés à la table `countries`
--  - sms_recharges.countryId → countries.id : pays du quota (NULL = quota commun, tous pays)
--  - sms_logs.countryId      → countries.id : pays du destinataire de chaque SMS
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- Les recharges existantes (countryId NULL) restent le quota commun : rien ne change sans nouvelle recharge par pays.
-- Si l'ancienne colonne countryCode (version précédente de ce script) existe : elle est convertie en countryId
-- (correspondance avec countries.code), puis supprimée — sauf s'il reste des lignes sans pays correspondant.
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- Migration équivalente : db/migrations/1794441600000-SmsQuotaByCountry.ts
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'sms_recharges'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

-- ⚠️ Contrôle : doit afficher le nom de VOTRE base (NULL = table sms_recharges introuvable)
SELECT @db AS base_modifiee;

-- Type, jeu de caractères et collation de countries.id (obligatoires pour une clé étrangère)
SET @ctype = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'countries' AND COLUMN_NAME = 'id');
SET @ccs   = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'countries' AND COLUMN_NAME = 'id');
SET @ccoll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'countries' AND COLUMN_NAME = 'id');
SET @cdef  = CONCAT(IFNULL(@ctype, 'varchar(36)'),
                    IF(@ccs IS NULL, '', CONCAT(' CHARACTER SET ', @ccs, ' COLLATE ', @ccoll)),
                    ' NULL DEFAULT NULL');

-- ⚠️ Contrôle : doit afficher le type de countries.id (NULL = table countries introuvable → arrêtez)
SELECT @ctype AS type_countries_id, @ccoll AS collation_countries_id;

SET @logs = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sms_logs');

-- ---------------------------------------------------------------------
-- 1) Colonnes countryId
-- ---------------------------------------------------------------------
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sms_recharges' AND COLUMN_NAME = 'countryId') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`sms_recharges` ADD COLUMN `countryId` ', @cdef, ' AFTER `category`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF(@logs = 1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sms_logs' AND COLUMN_NAME = 'countryId') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`sms_logs` ADD COLUMN `countryId` ', @cdef, ' AFTER `recipient`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 2) Ancienne colonne countryCode (si présente) → countryId
-- ---------------------------------------------------------------------
SET @rcc = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sms_recharges' AND COLUMN_NAME = 'countryCode');
SET @lcc = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sms_logs' AND COLUMN_NAME = 'countryCode');

SET @s = IF(@rcc = 1,
  CONCAT('UPDATE `', @db, '`.`sms_recharges` r JOIN `', @db, '`.`countries` c ON UPPER(TRIM(c.`code`)) = UPPER(TRIM(r.`countryCode`)) ',
         'SET r.`countryId` = c.`id` WHERE r.`countryId` IS NULL AND r.`countryCode` IS NOT NULL AND r.`countryCode` <> \'\''), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF(@lcc = 1,
  CONCAT('UPDATE `', @db, '`.`sms_logs` l JOIN `', @db, '`.`countries` c ON UPPER(TRIM(c.`code`)) = UPPER(TRIM(l.`countryCode`)) ',
         'SET l.`countryId` = c.`id` WHERE l.`countryId` IS NULL AND l.`countryCode` IS NOT NULL AND l.`countryCode` <> \'\''), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Recharges dont le code n'existe pas dans countries (à corriger à la main avant de relancer)
SET @s = IF(@rcc = 1,
  CONCAT('SELECT COUNT(*) INTO @orphans FROM `', @db, '`.`sms_recharges` WHERE `countryId` IS NULL AND `countryCode` IS NOT NULL AND `countryCode` <> \'\''),
  'SELECT 0 INTO @orphans');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SELECT @orphans AS recharges_pays_introuvable;

-- Ancien index (category, countryCode, status) : supprimé pour être recréé sur countryId
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sms_recharges'
              AND INDEX_NAME = 'idx_sms_recharges_cat_country_status' AND COLUMN_NAME = 'countryCode') > 0,
  CONCAT('ALTER TABLE `', @db, '`.`sms_recharges` DROP INDEX `idx_sms_recharges_cat_country_status`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- countryCode supprimée seulement si toutes les recharges ont été reliées à un pays
SET @s = IF(@rcc = 1 AND @orphans = 0, CONCAT('ALTER TABLE `', @db, '`.`sms_recharges` DROP COLUMN `countryCode`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF(@lcc = 1, CONCAT('ALTER TABLE `', @db, '`.`sms_logs` DROP COLUMN `countryCode`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 3) Index : catégorie + pays + statut (décompte rapide)
-- ---------------------------------------------------------------------
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'sms_recharges' AND INDEX_NAME = 'idx_sms_recharges_cat_country_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`sms_recharges` ADD INDEX `idx_sms_recharges_cat_country_status` (`category`,`countryId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 4) Clés étrangères vers countries
--    recharges : RESTRICT (un pays qui a des recharges ne peut pas être supprimé)
--    journal   : SET NULL (le journal est gardé si le pays est supprimé)
-- ---------------------------------------------------------------------
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'sms_recharges' AND CONSTRAINT_NAME = 'FK_e16f5239bc013d6d9c12b766d46') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`sms_recharges` ADD CONSTRAINT `FK_e16f5239bc013d6d9c12b766d46` FOREIGN KEY (`countryId`) REFERENCES `', @db, '`.`countries`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF(@logs = 1 AND (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'sms_logs' AND CONSTRAINT_NAME = 'FK_a29755d79edacac00022a2ebd20') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`sms_logs` ADD CONSTRAINT `FK_a29755d79edacac00022a2ebd20` FOREIGN KEY (`countryId`) REFERENCES `', @db, '`.`countries`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- Vérification : 2 colonnes countryId + 2 clés étrangères
-- ---------------------------------------------------------------------
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLLATION_NAME FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('sms_recharges', 'sms_logs') AND COLUMN_NAME IN ('countryId', 'countryCode');
SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME IN ('sms_recharges', 'sms_logs') AND REFERENCED_TABLE_NAME = 'countries';

-- Pays disponibles pour les recharges (id à utiliser dans POST /sms/recharges → countryId)
SET @s = CONCAT('SELECT id, name, code, status FROM `', @db, '`.`countries` ORDER BY name');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
