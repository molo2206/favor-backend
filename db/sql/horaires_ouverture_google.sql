-- =====================================================================
-- MISE À JOUR — Horaires d'ouverture des entreprises « comme Google »
--   • company.opening_hours  : horaires par jour, plusieurs plages (JSON)
--   • company.special_hours  : horaires exceptionnels (jours fériés…) (JSON)
--   • company.opening_status : OPERATIONAL | TEMPORARILY_CLOSED | PERMANENTLY_CLOSED
--   • company.reopen_date    : réouverture après une fermeture temporaire
--   • company.timezone       : fuseau horaire (rempli selon le pays ; RDC ouest = Africa/Kinshasa)
--   • les anciens horaires (opening_days / opening_time / closing_time) restent valables tant que opening_hours est vide
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ✅ Base détectée automatiquement (celle qui contient la table `company`).
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'company'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'favor_db1';
SELECT @db AS base_modifiee;

-- 1) Colonnes
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'opening_hours') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`company` ADD COLUMN `opening_hours` json NULL'), 'SELECT ''opening_hours : déjà là'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'special_hours') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`company` ADD COLUMN `special_hours` json NULL'), 'SELECT ''special_hours : déjà là'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'opening_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`company` ADD COLUMN `opening_status` varchar(30) NOT NULL DEFAULT ''OPERATIONAL'''), 'SELECT ''opening_status : déjà là'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'reopen_date') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`company` ADD COLUMN `reopen_date` date NULL'), 'SELECT ''reopen_date : déjà là'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'timezone') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`company` ADD COLUMN `timezone` varchar(64) NULL'), 'SELECT ''timezone : déjà là'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Anciennes colonnes (au cas où le script précédent n'a pas été exécuté)
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'opening_days') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`company` ADD COLUMN `opening_days` json NULL'), 'SELECT ''opening_days : déjà là'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'opening_time') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`company` ADD COLUMN `opening_time` varchar(5) NULL'), 'SELECT ''opening_time : déjà là'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'closing_time') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`company` ADD COLUMN `closing_time` varchar(5) NULL'), 'SELECT ''closing_time : déjà là'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Fuseau horaire selon le pays (si vide) ; RDC : ouest (longitude < 21,5°) = Africa/Kinshasa, sinon Africa/Lubumbashi
SET @s = CONCAT(
  'UPDATE `', @db, '`.`company` c LEFT JOIN `', @db, '`.`countries` co ON co.id = c.countryId SET c.timezone = CASE ',
  ' WHEN UPPER(co.code) IN (''CD'',''COD'') AND (CASE WHEN c.longitude REGEXP ''^-?[0-9]+([.][0-9]+)?$'' THEN CAST(c.longitude AS DECIMAL(10,6)) ELSE NULL END) BETWEEN 0.000001 AND 21.499999 THEN ''Africa/Kinshasa'' ',
  ' WHEN UPPER(co.code) IN (''CD'',''COD'') THEN ''Africa/Lubumbashi'' ',
  ' WHEN UPPER(co.code) IN (''RW'',''RWA'') THEN ''Africa/Kigali'' ',
  ' WHEN UPPER(co.code) IN (''BI'',''BDI'') THEN ''Africa/Bujumbura'' ',
  ' WHEN UPPER(co.code) IN (''UG'',''UGA'') THEN ''Africa/Kampala'' ',
  ' WHEN UPPER(co.code) IN (''BJ'',''BEN'') THEN ''Africa/Porto-Novo'' ',
  ' WHEN UPPER(co.code) IN (''AE'',''ARE'') THEN ''Asia/Dubai'' ',
  ' ELSE ''Africa/Lubumbashi'' END ',
  'WHERE c.timezone IS NULL OR c.timezone = ''''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'OK — horaires d''ouverture comme Google prêts' AS resultat;
