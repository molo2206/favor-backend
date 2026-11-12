-- =====================================================================
-- MISE À JOUR — Chat chauffeur ↔ client (une conversation par course)
--   • ride_chat_messages : messages texte et vocaux, lecture, suppression (masquée, gardée pour l'admin)
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ✅ Base détectée automatiquement (celle qui contient `company`).
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'company'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

SELECT @db AS base_modifiee;

SET @coll = COALESCE((SELECT TABLE_COLLATION FROM information_schema.TABLES
                       WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' LIMIT 1), 'utf8mb4_unicode_ci');
SET @cs = COALESCE((SELECT CHARACTER_SET_NAME FROM information_schema.COLLATIONS
                     WHERE COLLATION_NAME = @coll LIMIT 1), 'utf8mb4');

-- Types exacts des clés référencées (users.id, rides.id)
SET @u_type = COALESCE((SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @u_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @u_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @user_col = CONCAT(@u_type, IF(@u_cs IS NULL, '', CONCAT(' CHARACTER SET ', @u_cs, ' COLLATE ', @u_coll)));
SET @r_type = COALESCE((SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @r_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'id' LIMIT 1);
SET @r_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ride_col = CONCAT(@r_type, IF(@r_cs IS NULL, '', CONCAT(' CHARACTER SET ', @r_cs, ' COLLATE ', @r_coll)));

-- 1) Messages
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`ride_chat_messages` (',
  '`id` varchar(36) NOT NULL, ',
  '`rideId` ', @ride_col, ' NOT NULL, ',
  '`senderId` ', @user_col, ' NOT NULL, ',
  '`senderRole` enum(''RIDER'',''DRIVER'') NOT NULL, ',
  '`recipientId` varchar(36) NULL DEFAULT NULL, ',
  '`type` enum(''TEXT'',''AUDIO'') NOT NULL DEFAULT ''TEXT'', ',
  '`text` text NULL, ',
  '`audioUrl` varchar(500) NULL DEFAULT NULL, ',
  '`audioDuration` int NULL DEFAULT NULL, ',
  '`audioMimeType` varchar(100) NULL DEFAULT NULL, ',
  '`audioSize` int NULL DEFAULT NULL, ',
  '`clientMessageId` varchar(64) NULL DEFAULT NULL, ',
  '`deliveredAt` datetime(6) NULL DEFAULT NULL, ',
  '`readAt` datetime(6) NULL DEFAULT NULL, ',
  '`isDeleted` tinyint NOT NULL DEFAULT 0, ',
  '`deletedAt` datetime(6) NULL DEFAULT NULL, ',
  '`deletedById` varchar(36) NULL DEFAULT NULL, ',
  '`deletedBy` varchar(10) NULL DEFAULT NULL, ',
  '`deletedReason` varchar(500) NULL DEFAULT NULL, ',
  '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ',
  '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ',
  'PRIMARY KEY (`id`), ',
  'UNIQUE KEY `uq_ride_chat_client_msg` (`rideId`, `senderId`, `clientMessageId`), ',
  'KEY `idx_ride_chat_ride_created` (`rideId`, `createdAt`), ',
  'KEY `idx_ride_chat_sender` (`senderId`), ',
  'KEY `idx_ride_chat_recipient_read` (`recipientId`, `readAt`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Clés étrangères
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'ride_chat_messages' AND CONSTRAINT_NAME = 'fk_ride_chat_ride') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`ride_chat_messages` ADD CONSTRAINT `fk_ride_chat_ride` FOREIGN KEY (`rideId`) REFERENCES `', @db, '`.`rides` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'),
  'SELECT ''fk_ride_chat_ride : déjà en place'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'ride_chat_messages' AND CONSTRAINT_NAME = 'fk_ride_chat_sender') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`ride_chat_messages` ADD CONSTRAINT `fk_ride_chat_sender` FOREIGN KEY (`senderId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'),
  'SELECT ''fk_ride_chat_sender : déjà en place'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'OK — chat chauffeur ↔ client prêt' AS resultat;
