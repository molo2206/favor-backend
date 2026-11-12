-- =====================================================================
-- MISE À JOUR — Logique d'envoi des notifications (seulement aux personnes concernées)
--   • user_settings.marketing_notifications : le client accepte les notifications promotionnelles (1 par défaut)
--   • user_settings.last_marketing_push_at  : dernière promotion reçue (plafond PUSH_MARKETING_MIN_HOURS)
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'user_settings'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

SELECT @db AS base_modifiee;

-- 1) Promotions acceptées
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_settings' AND COLUMN_NAME = 'marketing_notifications') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`user_settings` ADD COLUMN `marketing_notifications` tinyint NOT NULL DEFAULT 1'),
  'SELECT ''user_settings.marketing_notifications : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Dernière promotion reçue
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_settings' AND COLUMN_NAME = 'last_marketing_push_at') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`user_settings` ADD COLUMN `last_marketing_push_at` datetime NULL DEFAULT NULL'),
  'SELECT ''user_settings.last_marketing_push_at : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3) Index (recherche des clients éligibles)
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_settings' AND INDEX_NAME = 'idx_user_settings_marketing') = 0,
  CONCAT('CREATE INDEX `idx_user_settings_marketing` ON `', @db, '`.`user_settings` (`marketing_notifications`, `last_marketing_push_at`)'),
  'SELECT ''idx_user_settings_marketing : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 4) Index utile au ciblage : appareils par plateforme
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'device_tokens' AND INDEX_NAME = 'idx_device_tokens_user_platform') = 0,
  CONCAT('CREATE INDEX `idx_device_tokens_user_platform` ON `', @db, '`.`device_tokens` (`userId`, `platform`)'),
  'SELECT ''idx_device_tokens_user_platform : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'OK — logique d''envoi des notifications prête' AS resultat;
