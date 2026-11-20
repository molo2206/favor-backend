-- =====================================================================
-- MISE À JOUR — Chat chauffeur ↔ client : répondre à un message + « supprimer pour moi »
--   • ride_chat_messages.replyToId : message auquel on répond
--   • ride_chat_messages.hiddenFor : participants qui ont supprimé le message « pour eux »
--     (l'administration voit toujours tous les messages)
-- ⚠️ Exécuter d'abord chat_chauffeur_client.sql (table ride_chat_messages).
-- MySQL 8 — SANS procédure stockée — idempotent. Exécuter le fichier EN ENTIER.
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'ride_chat_messages'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- SET @db = 'nom_de_votre_base';
SELECT @db AS base_modifiee;

-- 1) Réponse
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ride_chat_messages' AND COLUMN_NAME = 'replyToId') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`ride_chat_messages` ADD COLUMN `replyToId` varchar(36) NULL DEFAULT NULL AFTER `audioSize`'),
  'SELECT ''ride_chat_messages.replyToId : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Supprimé « pour moi »
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ride_chat_messages' AND COLUMN_NAME = 'hiddenFor') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`ride_chat_messages` ADD COLUMN `hiddenFor` text NULL AFTER `replyToId`'),
  'SELECT ''ride_chat_messages.hiddenFor : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3) Index + clé étrangère (réponse → message cité ; message cité supprimé physiquement → NULL)
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ride_chat_messages' AND INDEX_NAME = 'idx_ride_chat_reply') = 0,
  CONCAT('CREATE INDEX `idx_ride_chat_reply` ON `', @db, '`.`ride_chat_messages` (`replyToId`)'),
  'SELECT ''idx_ride_chat_reply : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'ride_chat_messages' AND CONSTRAINT_NAME = 'fk_ride_chat_reply') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`ride_chat_messages` ADD CONSTRAINT `fk_ride_chat_reply` FOREIGN KEY (`replyToId`) REFERENCES `', @db, '`.`ride_chat_messages` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'),
  'SELECT ''fk_ride_chat_reply : déjà en place'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'OK — réponses et « supprimer pour moi » prêts' AS resultat;
