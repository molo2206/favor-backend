-- =====================================================================
-- MISE À JOUR — Appels même application fermée (iPhone : VoIP / CallKit)
--   • device_tokens.voipToken : jeton VoIP (PushKit) de l'iPhone, envoyé par l'app à POST /users/device-token
--   • device_tokens.platform : les anciens appareils enregistrés « unknown » gardent cette valeur
--     jusqu'à leur prochain enregistrement (l'app renvoie son jeton avec l'en-tête x-platform)
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'company'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

SELECT @db AS base_modifiee;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'device_tokens' AND COLUMN_NAME = 'voipToken') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`device_tokens` ADD COLUMN `voipToken` varchar(255) NULL DEFAULT NULL'),
  'SELECT ''device_tokens.voipToken : existe déjà'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'device_tokens' AND INDEX_NAME = 'idx_device_tokens_voip') = 0,
  CONCAT('CREATE INDEX `idx_device_tokens_voip` ON `', @db, '`.`device_tokens` (`voipToken`)'),
  'SELECT ''index idx_device_tokens_voip : existe déjà'' AS info');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'OK — appels VoIP iPhone prêts' AS resultat;
