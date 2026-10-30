-- =====================================================================
-- Entreprises : jours d'ouverture + heure d'ouverture / de fermeture
-- MySQL 8 — sans procédure stockée — idempotent (peut être relancé).
-- ⚠️ Sélectionnez d'abord la base de l'application dans phpMyAdmin
--    (PAS information_schema), puis exécutez tout le script en une fois.
-- =====================================================================

SELECT DATABASE() AS base_utilisee;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company' AND COLUMN_NAME = 'opening_days') = 0,
  'ALTER TABLE `company` ADD COLUMN `opening_days` json NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company' AND COLUMN_NAME = 'opening_time') = 0,
  'ALTER TABLE `company` ADD COLUMN `opening_time` varchar(5) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company' AND COLUMN_NAME = 'closing_time') = 0,
  'ALTER TABLE `company` ADD COLUMN `closing_time` varchar(5) NULL DEFAULT NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Vérification
SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company'
   AND COLUMN_NAME IN ('opening_days', 'opening_time', 'closing_time');
