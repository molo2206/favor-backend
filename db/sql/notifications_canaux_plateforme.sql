-- =====================================================================
-- MISE À JOUR — Canaux de notification par application (x-platform)
--   • user_notifications.channels : "mobile,web" … NULL = toutes les applications
--   • Index (userId, isRead) conservé ; aucune donnée existante modifiée
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ✅ Base détectée automatiquement (celle qui contient `company`).
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'company'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

SELECT @db AS base_modifiee;

-- 1) Colonne channels
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_notifications' AND COLUMN_NAME = 'channels') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`user_notifications` ADD COLUMN `channels` varchar(60) NULL DEFAULT NULL'),
  'SELECT ''channels existe déjà'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Plateforme des appareils (device_tokens.platform) : normaliser en minuscules
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'device_tokens' AND COLUMN_NAME = 'platform') = 1,
  CONCAT('UPDATE `', @db, '`.`device_tokens` SET `platform` = LOWER(TRIM(`platform`)) WHERE `platform` IS NOT NULL'),
  'SELECT ''device_tokens.platform absente'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'OK — canaux de notification prêts' AS resultat;
