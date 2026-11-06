-- =====================================================================
-- Cache Google Maps en base de données
--  1) Table maps_api_cache : une ligne par requête Google unique (clé SHA-256, UNIQUE → aucun doublon)
--  2) Index addresses.place_id : la recherche d'un lieu par place_id ne parcourt plus toute la table
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- Aucune donnée existante n'est modifiée ni supprimée.
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- Migration équivalente : db/migrations/1794528000000-MapsApiCache.ts
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'addresses'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

-- ⚠️ Contrôle : doit afficher le nom de VOTRE base (NULL = table addresses introuvable)
SELECT @db AS base_modifiee;

-- 1) Table maps_api_cache
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`maps_api_cache` (',
  '`id` varchar(36) NOT NULL,',
  '`kind` varchar(40) NOT NULL,',
  '`key_hash` char(64) NOT NULL,',
  '`request` text NOT NULL,',
  '`status` varchar(30) NOT NULL DEFAULT ''OK'',',
  '`response` json NOT NULL,',
  '`hit_count` int NOT NULL DEFAULT 0,',
  '`google_calls` int NOT NULL DEFAULT 1,',
  '`expires_at` datetime NOT NULL,',
  '`last_hit_at` datetime NULL DEFAULT NULL,',
  '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
  '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),',
  'PRIMARY KEY (`id`),',
  'UNIQUE KEY `uq_maps_api_cache_key_hash` (`key_hash`),',
  'KEY `idx_maps_api_cache_kind_expires` (`kind`, `expires_at`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Index addresses.place_id
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'place_id' AND SEQ_IN_INDEX = 1) = 0,
  CONCAT('ALTER TABLE `', @db, '`.`addresses` ADD INDEX `idx_addresses_place_id` (`place_id`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Vérification : 1 table + index
SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'maps_api_cache';
SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'place_id';

-- (Facultatif) Doublons déjà présents dans addresses (même place_id) — information seulement, rien n'est supprimé :
SET @s = CONCAT('SELECT place_id, COUNT(*) AS lignes FROM `', @db, '`.`addresses` WHERE place_id IS NOT NULL AND place_id <> '''' GROUP BY place_id HAVING COUNT(*) > 1 ORDER BY lignes DESC LIMIT 50');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
