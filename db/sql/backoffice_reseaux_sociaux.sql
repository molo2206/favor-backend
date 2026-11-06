-- =====================================================================
-- BackOffice — Média : gestion des RÉSEAUX SOCIAUX
--   (publications, plateformes, j'aime / commentaires / partages / vues par jour, abonnés)
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ✅ Fonctionne même si « information_schema » est sélectionnée dans phpMyAdmin :
--    la base de l'application est détectée automatiquement (celle qui contient `company`).
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- ℹ️ Exécuter APRÈS backoffice_media.sql (liens vers bo_media_projects ;
--    si absent, ces liens sont simplement ignorés, rien ne casse).
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'company'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

-- ⚠️ Contrôle : doit afficher le nom de VOTRE base (NULL = table company introuvable)
SELECT @db AS base_modifiee;

SET @coll = COALESCE((SELECT TABLE_COLLATION FROM information_schema.TABLES
                       WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' LIMIT 1), 'utf8mb4_unicode_ci');
SET @cs = COALESCE((SELECT CHARACTER_SET_NAME FROM information_schema.COLLATIONS
                     WHERE COLLATION_NAME = @coll LIMIT 1), 'utf8mb4');
SET @OLD_FK = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1) Comptes / pages gérés (entreprise ou clients)
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_social_accounts` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `platform` enum(''FACEBOOK'',''INSTAGRAM'',''TIKTOK'',''YOUTUBE'',''LINKEDIN'',''X'',''WHATSAPP'',''SNAPCHAT'',''THREADS'',''PINTEREST'',''OTHER'') NOT NULL,
  `name` varchar(150) NOT NULL,
  `handle` varchar(150) NULL DEFAULT NULL,
  `url` varchar(500) NULL DEFAULT NULL,
  `projectId` varchar(36) NULL DEFAULT NULL,
  `clientName` varchar(150) NULL DEFAULT NULL,
  `managerId` varchar(36) NULL DEFAULT NULL,
  `followers` int NOT NULL DEFAULT 0,
  `followersUpdatedOn` date NULL DEFAULT NULL,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `notes` varchar(500) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND INDEX_NAME = 'idx_bo_social_account_company') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_social_accounts` ADD INDEX `idx_bo_social_account_company` (`companyId`,`platform`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND INDEX_NAME = 'idx_bo_social_account_project') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_social_accounts` ADD INDEX `idx_bo_social_account_project` (`projectId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 2) Publications : ce qu'on poste (texte, visuels, vidéo, hashtags, campagne)
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_social_posts` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `projectId` varchar(36) NULL DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `caption` text NULL,
  `hashtags` json NULL,
  `type` enum(''IMAGE'',''CAROUSEL'',''VIDEO'',''REEL'',''STORY'',''LIVE'',''TEXT'',''LINK'',''OTHER'') NOT NULL DEFAULT ''IMAGE'',
  `mediaFileIds` json NULL,
  `link` varchar(1000) NULL DEFAULT NULL,
  `campaign` varchar(120) NULL DEFAULT NULL,
  `status` enum(''DRAFT'',''PENDING_APPROVAL'',''APPROVED'',''SCHEDULED'',''PUBLISHED'',''CANCELLED'') NOT NULL DEFAULT ''DRAFT'',
  `scheduledAt` datetime(6) NULL DEFAULT NULL,
  `publishedAt` datetime(6) NULL DEFAULT NULL,
  `approvedById` varchar(36) NULL DEFAULT NULL,
  `approvedAt` datetime(6) NULL DEFAULT NULL,
  `notes` varchar(500) NULL DEFAULT NULL,
  `createdById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts' AND INDEX_NAME = 'idx_bo_social_post_company_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_social_posts` ADD INDEX `idx_bo_social_post_company_status` (`companyId`,`status`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts' AND INDEX_NAME = 'idx_bo_social_post_scheduled') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_social_posts` ADD INDEX `idx_bo_social_post_scheduled` (`companyId`,`scheduledAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 3) Publication par plateforme / compte (lien du post, totaux j'aime, commentaires…)
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_social_post_targets` (',
  '
  `id` varchar(36) NOT NULL,
  `postId` varchar(36) NOT NULL,
  `accountId` varchar(36) NOT NULL,
  `platform` enum(''FACEBOOK'',''INSTAGRAM'',''TIKTOK'',''YOUTUBE'',''LINKEDIN'',''X'',''WHATSAPP'',''SNAPCHAT'',''THREADS'',''PINTEREST'',''OTHER'') NOT NULL,
  `status` enum(''PLANNED'',''PUBLISHED'',''FAILED'',''REMOVED'') NOT NULL DEFAULT ''PLANNED'',
  `publishedAt` datetime(6) NULL DEFAULT NULL,
  `postUrl` varchar(1000) NULL DEFAULT NULL,
  `externalId` varchar(255) NULL DEFAULT NULL,
  `boostSpent` decimal(14,2) NOT NULL DEFAULT 0,
  `likes` int NOT NULL DEFAULT 0,
  `comments` int NOT NULL DEFAULT 0,
  `shares` int NOT NULL DEFAULT 0,
  `saves` int NOT NULL DEFAULT 0,
  `views` int NOT NULL DEFAULT 0,
  `reach` int NOT NULL DEFAULT 0,
  `impressions` int NOT NULL DEFAULT 0,
  `clicks` int NOT NULL DEFAULT 0,
  `lastStatsOn` date NULL DEFAULT NULL,
  `note` varchar(500) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_targets' AND INDEX_NAME = 'uq_bo_social_target') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_social_post_targets` ADD UNIQUE INDEX `uq_bo_social_target` (`postId`,`accountId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_targets' AND INDEX_NAME = 'idx_bo_social_target_account') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_social_post_targets` ADD INDEX `idx_bo_social_target_account` (`accountId`,`publishedAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 4) Chiffres journaliers par publication (j'aime, commentaires, partages, vues, portée…)
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_social_post_daily_stats` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `targetId` varchar(36) NOT NULL,
  `postId` varchar(36) NOT NULL,
  `accountId` varchar(36) NOT NULL,
  `platform` enum(''FACEBOOK'',''INSTAGRAM'',''TIKTOK'',''YOUTUBE'',''LINKEDIN'',''X'',''WHATSAPP'',''SNAPCHAT'',''THREADS'',''PINTEREST'',''OTHER'') NOT NULL,
  `statDate` date NOT NULL,
  `likes` int NOT NULL DEFAULT 0,
  `comments` int NOT NULL DEFAULT 0,
  `shares` int NOT NULL DEFAULT 0,
  `saves` int NOT NULL DEFAULT 0,
  `views` int NOT NULL DEFAULT 0,
  `reach` int NOT NULL DEFAULT 0,
  `impressions` int NOT NULL DEFAULT 0,
  `clicks` int NOT NULL DEFAULT 0,
  `recordedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_daily_stats' AND INDEX_NAME = 'uq_bo_social_post_stat_day') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_social_post_daily_stats` ADD UNIQUE INDEX `uq_bo_social_post_stat_day` (`targetId`,`statDate`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_daily_stats' AND INDEX_NAME = 'idx_bo_social_post_stat_company_day') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_social_post_daily_stats` ADD INDEX `idx_bo_social_post_stat_company_day` (`companyId`,`statDate`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 5) Relevé journalier des comptes (abonnés, nouveaux abonnés, visites, messages)
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`bo_social_account_daily_stats` (',
  '
  `id` varchar(36) NOT NULL,
  `companyId` varchar(36) NOT NULL,
  `accountId` varchar(36) NOT NULL,
  `platform` enum(''FACEBOOK'',''INSTAGRAM'',''TIKTOK'',''YOUTUBE'',''LINKEDIN'',''X'',''WHATSAPP'',''SNAPCHAT'',''THREADS'',''PINTEREST'',''OTHER'') NOT NULL,
  `statDate` date NOT NULL,
  `followers` int NOT NULL DEFAULT 0,
  `newFollowers` int NOT NULL DEFAULT 0,
  `reach` int NOT NULL DEFAULT 0,
  `impressions` int NOT NULL DEFAULT 0,
  `profileViews` int NOT NULL DEFAULT 0,
  `messages` int NOT NULL DEFAULT 0,
  `recordedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_account_daily_stats' AND INDEX_NAME = 'uq_bo_social_account_stat_day') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_social_account_daily_stats` ADD UNIQUE INDEX `uq_bo_social_account_stat_day` (`accountId`,`statDate`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_account_daily_stats' AND INDEX_NAME = 'idx_bo_social_account_stat_company_day') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`bo_social_account_daily_stats` ADD INDEX `idx_bo_social_account_stat_company_day` (`companyId`,`statDate`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 6) Clés étrangères
--    (chaque colonne est d'abord alignée sur `table référencée`.`id` → évite l'erreur #3780)
-- ---------------------------------------------------------------------
-- bo_social_accounts.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND CONSTRAINT_NAME = 'fk_bo_social_account_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_accounts` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_accounts` ADD CONSTRAINT `fk_bo_social_account_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_accounts.projectId → bo_media_projects.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND COLUMN_NAME = 'projectId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND CONSTRAINT_NAME = 'fk_bo_social_account_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_accounts` MODIFY `projectId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_accounts` ADD CONSTRAINT `fk_bo_social_account_project` FOREIGN KEY (`projectId`) REFERENCES `', @db, '`.`bo_media_projects` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_accounts.managerId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND COLUMN_NAME = 'managerId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND CONSTRAINT_NAME = 'fk_bo_social_account_manager' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_accounts` MODIFY `managerId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_accounts` ADD CONSTRAINT `fk_bo_social_account_manager` FOREIGN KEY (`managerId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_posts.companyId → company.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts' AND COLUMN_NAME = 'companyId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts' AND CONSTRAINT_NAME = 'fk_bo_social_post_company' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_posts` MODIFY `companyId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_posts` ADD CONSTRAINT `fk_bo_social_post_company` FOREIGN KEY (`companyId`) REFERENCES `', @db, '`.`company` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_posts.projectId → bo_media_projects.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_media_projects' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts' AND COLUMN_NAME = 'projectId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts' AND CONSTRAINT_NAME = 'fk_bo_social_post_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_posts` MODIFY `projectId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_posts` ADD CONSTRAINT `fk_bo_social_post_project` FOREIGN KEY (`projectId`) REFERENCES `', @db, '`.`bo_media_projects` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_posts.createdById → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts' AND COLUMN_NAME = 'createdById' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts' AND CONSTRAINT_NAME = 'fk_bo_social_post_creator' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_posts` MODIFY `createdById` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_posts` ADD CONSTRAINT `fk_bo_social_post_creator` FOREIGN KEY (`createdById`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_post_targets.postId → bo_social_posts.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_posts' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_targets' AND COLUMN_NAME = 'postId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_targets' AND CONSTRAINT_NAME = 'fk_bo_social_target_post' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_post_targets` MODIFY `postId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_post_targets` ADD CONSTRAINT `fk_bo_social_target_post` FOREIGN KEY (`postId`) REFERENCES `', @db, '`.`bo_social_posts` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_post_targets.accountId → bo_social_accounts.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_targets' AND COLUMN_NAME = 'accountId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_targets' AND CONSTRAINT_NAME = 'fk_bo_social_target_account' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_post_targets` MODIFY `accountId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_post_targets` ADD CONSTRAINT `fk_bo_social_target_account` FOREIGN KEY (`accountId`) REFERENCES `', @db, '`.`bo_social_accounts` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_post_daily_stats.targetId → bo_social_post_targets.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_targets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_targets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_targets' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_daily_stats' AND COLUMN_NAME = 'targetId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_social_post_daily_stats' AND CONSTRAINT_NAME = 'fk_bo_social_post_stat_target' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_post_daily_stats` MODIFY `targetId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_post_daily_stats` ADD CONSTRAINT `fk_bo_social_post_stat_target` FOREIGN KEY (`targetId`) REFERENCES `', @db, '`.`bo_social_post_targets` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- bo_social_account_daily_stats.accountId → bo_social_accounts.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_accounts' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'bo_social_account_daily_stats' AND COLUMN_NAME = 'accountId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'bo_social_account_daily_stats' AND CONSTRAINT_NAME = 'fk_bo_social_account_stat_account' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_account_daily_stats` MODIFY `accountId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`bo_social_account_daily_stats` ADD CONSTRAINT `fk_bo_social_account_stat_account` FOREIGN KEY (`accountId`) REFERENCES `', @db, '`.`bo_social_accounts` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET FOREIGN_KEY_CHECKS = @OLD_FK;

-- Vérification : doit lister les 5 tables réseaux sociaux
SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('bo_social_accounts','bo_social_posts','bo_social_post_targets','bo_social_post_daily_stats','bo_social_account_daily_stats')
 ORDER BY TABLE_NAME;
