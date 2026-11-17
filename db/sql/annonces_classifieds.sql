-- =====================================================================
-- Annonces type Jiji DANS LA TABLE `products` (listingType = 'CLASSIFIED')
--   • `products` : companyId devient facultatif + colonnes listingType, ownerId, adCityId, ad*
--   • photos : table existante `image_product_entity` ; favoris : table existante `wishlists`
--   • nouvelles tables : classified_pricing_plans (tarifs par ville), classified_payments, classified_reports
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ✅ Fonctionne même si « information_schema » est sélectionnée dans phpMyAdmin :
--    la base de l'application est détectée automatiquement (celle qui contient `products`).
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- ℹ️ Les produits existants ne changent pas : listingType = 'PRODUCT' par défaut, colonnes ad* vides.
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'products'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

-- ⚠️ Contrôle : doit afficher le nom de VOTRE base (NULL = table products introuvable)
SELECT @db AS base_modifiee;

SET @coll = COALESCE((SELECT TABLE_COLLATION FROM information_schema.TABLES
                       WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' LIMIT 1), 'utf8mb4_unicode_ci');
SET @cs = COALESCE((SELECT CHARACTER_SET_NAME FROM information_schema.COLLATIONS
                     WHERE COLLATION_NAME = @coll LIMIT 1), 'utf8mb4');
SET @OLD_FK = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1) Nettoyage de la 1re version (tables d'annonces séparées), si elle a été exécutée
-- ---------------------------------------------------------------------
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_favorites') > 0, CONCAT('DROP TABLE `', @db, '`.`classified_favorites`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_ad_images') > 0, CONCAT('DROP TABLE `', @db, '`.`classified_ad_images`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_ads') > 0, CONCAT('DROP TABLE `', @db, '`.`classified_ads`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- classified_payments : ancienne structure (colonne adId) → recréée avec productId
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND COLUMN_NAME = 'adId') > 0, CONCAT('DROP TABLE `', @db, '`.`classified_payments`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- classified_reports : ancienne structure (colonne adId) → recréée avec productId
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_reports' AND COLUMN_NAME = 'adId') > 0, CONCAT('DROP TABLE `', @db, '`.`classified_reports`'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 2) products : l'entreprise devient facultative (une annonce n'a pas d'entreprise)
-- ---------------------------------------------------------------------
SET @company_col = COALESCE((SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
                              WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND REFERENCED_TABLE_NAME = 'company' LIMIT 1), 'companyId');
SET @c_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = @company_col LIMIT 1);
SET @c_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = @company_col LIMIT 1);
SET @c_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = @company_col LIMIT 1);
SET @c_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = @company_col LIMIT 1);
SET @s = IF(@c_type IS NOT NULL AND @c_null = 'NO', CONCAT('ALTER TABLE `', @db, '`.`products` MODIFY `', @company_col, '` ', @c_type, IF(@c_cs IS NULL, '', CONCAT(' CHARACTER SET ', @c_cs, ' COLLATE ', @c_coll)), ' NULL DEFAULT NULL'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 3) products : colonnes des annonces
-- ---------------------------------------------------------------------
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'listingType') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`listingType` enum(''PRODUCT'',''CLASSIFIED'') NOT NULL DEFAULT ''PRODUCT'''));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'ownerId') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`ownerId` varchar(36) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adCityId') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adCityId` varchar(36) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adStatus') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adStatus` enum(''DRAFT'',''PENDING_PAYMENT'',''PENDING_REVIEW'',''ACTIVE'',''REJECTED'',''EXPIRED'',''SOLD'',''CLOSED'') NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adCondition') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adCondition` enum(''NEW'',''USED'',''REFURBISHED'',''NOT_APPLICABLE'') NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adCurrency') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adCurrency` varchar(10) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adNegotiable') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adNegotiable` tinyint NOT NULL DEFAULT 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adContactPhone') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adContactPhone` varchar(30) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adWhatsapp') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adWhatsapp` varchar(30) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adShowPhone') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adShowPhone` tinyint NOT NULL DEFAULT 1'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adPlanId') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adPlanId` varchar(36) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adPlanCode') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adPlanCode` varchar(50) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adPublishedAt') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adPublishedAt` datetime(6) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adExpiresAt') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adExpiresAt` datetime(6) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adFeaturedUntil') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adFeaturedUntil` datetime(6) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adPendingDays') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adPendingDays` int NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adPendingFeatured') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adPendingFeatured` tinyint NOT NULL DEFAULT 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adRejectionReason') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adRejectionReason` varchar(500) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adReviewedById') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adReviewedById` varchar(36) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adReviewedAt') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adReviewedAt` datetime(6) NULL DEFAULT NULL'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adReminderSent') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adReminderSent` tinyint NOT NULL DEFAULT 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adViews') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adViews` int NOT NULL DEFAULT 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adContactClicks') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adContactClicks` int NOT NULL DEFAULT 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adDeleted') > 0, 'SELECT 1', CONCAT('ALTER TABLE `', @db, '`.`products` ADD COLUMN ', '`adDeleted` tinyint NOT NULL DEFAULT 0'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_listing') = 0, CONCAT('ALTER TABLE `', @db, '`.`products` ADD INDEX `idx_products_listing` (`listingType`,`adStatus`,`adCityId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_owner') = 0, CONCAT('ALTER TABLE `', @db, '`.`products` ADD INDEX `idx_products_owner` (`ownerId`,`adStatus`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_ad_expires') = 0, CONCAT('ALTER TABLE `', @db, '`.`products` ADD INDEX `idx_products_ad_expires` (`adStatus`,`adExpiresAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_ad_published') = 0, CONCAT('ALTER TABLE `', @db, '`.`products` ADD INDEX `idx_products_ad_published` (`listingType`,`adStatus`,`adPublishedAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 4) Tarifs de publication (par ville / pays / catégorie)
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`classified_pricing_plans` (',
  '
  `id` varchar(36) NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` varchar(500) NULL DEFAULT NULL,
  `cityId` varchar(36) NULL DEFAULT NULL,
  `countryId` varchar(36) NULL DEFAULT NULL,
  `categoryId` varchar(36) NULL DEFAULT NULL,
  `durationDays` int NOT NULL DEFAULT 30,
  `price` decimal(14,2) NOT NULL DEFAULT 0,
  `currency` varchar(10) NOT NULL DEFAULT ''USD'',
  `isFeatured` tinyint NOT NULL DEFAULT 0,
  `maxImages` int NOT NULL DEFAULT 10,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_pricing_plans' AND INDEX_NAME = 'idx_classified_plan_code') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_pricing_plans` ADD INDEX `idx_classified_plan_code` (`code`,`isActive`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_pricing_plans' AND INDEX_NAME = 'idx_classified_plan_city') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_pricing_plans` ADD INDEX `idx_classified_plan_city` (`cityId`,`isActive`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 5) Paiements des annonces (FPay, Mobile Money, gratuit, manuel) → products.id
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`classified_payments` (',
  '
  `id` varchar(36) NOT NULL,
  `reference` varchar(30) NOT NULL,
  `productId` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `planId` varchar(36) NULL DEFAULT NULL,
  `planSnapshot` json NULL,
  `cityId` varchar(36) NULL DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT ''USD'',
  `method` enum(''FPAY'',''MOBILE_MONEY'',''FREE'',''MANUAL'') NOT NULL,
  `status` enum(''PENDING'',''SUCCESS'',''FAILED'') NOT NULL DEFAULT ''PENDING'',
  `provider` varchar(60) NULL DEFAULT NULL,
  `phone` varchar(30) NULL DEFAULT NULL,
  `externalId` varchar(100) NULL DEFAULT NULL,
  `transactionId` varchar(100) NULL DEFAULT NULL,
  `transactionReference` varchar(100) NULL DEFAULT NULL,
  `failureReason` varchar(500) NULL DEFAULT NULL,
  `paidAt` datetime(6) NULL DEFAULT NULL,
  `applied` tinyint NOT NULL DEFAULT 0,
  `validatedById` varchar(36) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND INDEX_NAME = 'uq_classified_payment_reference') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_payments` ADD UNIQUE INDEX `uq_classified_payment_reference` (`reference`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND INDEX_NAME = 'idx_classified_payment_product') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_payments` ADD INDEX `idx_classified_payment_product` (`productId`,`createdAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND INDEX_NAME = 'idx_classified_payment_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_payments` ADD INDEX `idx_classified_payment_status` (`status`,`createdAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND INDEX_NAME = 'idx_classified_payment_city') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_payments` ADD INDEX `idx_classified_payment_city` (`cityId`,`paidAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 6) Signalements → products.id
-- ---------------------------------------------------------------------
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`classified_reports` (',
  '
  `id` varchar(36) NOT NULL,
  `productId` varchar(36) NOT NULL,
  `reporterId` varchar(36) NULL DEFAULT NULL,
  `reason` enum(''SCAM'',''PROHIBITED'',''WRONG_CATEGORY'',''DUPLICATE'',''SOLD'',''OFFENSIVE'',''OTHER'') NOT NULL,
  `message` varchar(1000) NULL DEFAULT NULL,
  `status` enum(''OPEN'',''RESOLVED'',''DISMISSED'') NOT NULL DEFAULT ''OPEN'',
  `handledById` varchar(36) NULL DEFAULT NULL,
  `resolution` varchar(500) NULL DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_reports' AND INDEX_NAME = 'idx_classified_report_status') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_reports` ADD INDEX `idx_classified_report_status` (`status`,`createdAt`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_reports' AND INDEX_NAME = 'idx_classified_report_product') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_reports` ADD INDEX `idx_classified_report_product` (`productId`)'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 7) Clés étrangères
--    (chaque colonne est d'abord alignée sur `table référencée`.`id` → évite l'erreur #3780)
-- ---------------------------------------------------------------------
-- products.ownerId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'ownerId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'products' AND CONSTRAINT_NAME = 'fk_products_owner' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`products` MODIFY `ownerId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`products` ADD CONSTRAINT `fk_products_owner` FOREIGN KEY (`ownerId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- products.adCityId → cities.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'adCityId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'products' AND CONSTRAINT_NAME = 'fk_products_ad_city' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`products` MODIFY `adCityId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`products` ADD CONSTRAINT `fk_products_ad_city` FOREIGN KEY (`adCityId`) REFERENCES `', @db, '`.`cities` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- classified_pricing_plans.cityId → cities.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cities' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_pricing_plans' AND COLUMN_NAME = 'cityId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'classified_pricing_plans' AND CONSTRAINT_NAME = 'fk_classified_plan_city' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_pricing_plans` MODIFY `cityId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_pricing_plans` ADD CONSTRAINT `fk_classified_plan_city` FOREIGN KEY (`cityId`) REFERENCES `', @db, '`.`cities` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- classified_pricing_plans.countryId → countries.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'countries' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'countries' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'countries' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_pricing_plans' AND COLUMN_NAME = 'countryId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'classified_pricing_plans' AND CONSTRAINT_NAME = 'fk_classified_plan_country' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_pricing_plans` MODIFY `countryId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_pricing_plans` ADD CONSTRAINT `fk_classified_plan_country` FOREIGN KEY (`countryId`) REFERENCES `', @db, '`.`countries` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- classified_pricing_plans.categoryId → category.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'category' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'category' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'category' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_pricing_plans' AND COLUMN_NAME = 'categoryId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'classified_pricing_plans' AND CONSTRAINT_NAME = 'fk_classified_plan_category' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_pricing_plans` MODIFY `categoryId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_pricing_plans` ADD CONSTRAINT `fk_classified_plan_category` FOREIGN KEY (`categoryId`) REFERENCES `', @db, '`.`category` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- classified_payments.productId → products.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND COLUMN_NAME = 'productId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND CONSTRAINT_NAME = 'fk_classified_payment_product' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_payments` MODIFY `productId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_payments` ADD CONSTRAINT `fk_classified_payment_product` FOREIGN KEY (`productId`) REFERENCES `', @db, '`.`products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- classified_payments.userId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND COLUMN_NAME = 'userId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'classified_payments' AND CONSTRAINT_NAME = 'fk_classified_payment_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_payments` MODIFY `userId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_payments` ADD CONSTRAINT `fk_classified_payment_user` FOREIGN KEY (`userId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- classified_reports.productId → products.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_reports' AND COLUMN_NAME = 'productId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'classified_reports' AND CONSTRAINT_NAME = 'fk_classified_report_product' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_reports` MODIFY `productId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_reports` ADD CONSTRAINT `fk_classified_report_product` FOREIGN KEY (`productId`) REFERENCES `', @db, '`.`products` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- classified_reports.reporterId → users.id
SET @ref_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @cur_null = (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_reports' AND COLUMN_NAME = 'reporterId' LIMIT 1);
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'classified_reports' AND CONSTRAINT_NAME = 'fk_classified_report_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0 AND @ref_type IS NOT NULL AND @cur_null IS NOT NULL;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_reports` MODIFY `reporterId` ', @ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)), IF(@cur_null = 'YES', ' NULL DEFAULT NULL', ' NOT NULL')), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF(@fk_ok, CONCAT('ALTER TABLE `', @db, '`.`classified_reports` ADD CONSTRAINT `fk_classified_report_user` FOREIGN KEY (`reporterId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION'), 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- (Facultatif) Tarifs de départ — décommentez puis adaptez les prix.
--   Tarifs généraux (toutes les villes). Pour une ville : même `code` + `cityId`
--   (ou route POST /admin/classifieds/pricing-plans/copy-to-city/:cityId?percent=20).
-- ---------------------------------------------------------------------
-- SET @s = CONCAT('INSERT INTO `', @db, '`.`classified_pricing_plans` (`id`,`code`,`name`,`description`,`durationDays`,`price`,`currency`,`isFeatured`,`maxImages`,`isActive`,`sortOrder`) ',
--   'SELECT UUID(),''STANDARD_30J'',''Standard 30 jours'',''Annonce visible 30 jours'',30,2.00,''USD'',0,10,1,1 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `', @db, '`.`classified_pricing_plans` WHERE `code`=''STANDARD_30J'' AND `cityId` IS NULL AND `countryId` IS NULL AND `categoryId` IS NULL)');
-- PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- SET @s = CONCAT('INSERT INTO `', @db, '`.`classified_pricing_plans` (`id`,`code`,`name`,`description`,`durationDays`,`price`,`currency`,`isFeatured`,`maxImages`,`isActive`,`sortOrder`) ',
--   'SELECT UUID(),''TOP_30J'',''Top 30 jours'',''En tête des résultats pendant 30 jours'',30,5.00,''USD'',1,15,1,2 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `', @db, '`.`classified_pricing_plans` WHERE `code`=''TOP_30J'' AND `cityId` IS NULL AND `countryId` IS NULL AND `categoryId` IS NULL)');
-- PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;


SET FOREIGN_KEY_CHECKS = @OLD_FK;

-- Vérification 1 : les 3 tables des annonces
SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME IN ('classified_pricing_plans','classified_payments','classified_reports')
 ORDER BY TABLE_NAME;

-- Vérification 2 : nouvelles colonnes de `products` (doit afficher 24 lignes) + companyId nullable = YES
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products'
   AND (COLUMN_NAME IN ('listingType','ownerId','adCityId','adStatus','adCondition','adCurrency','adNegotiable','adContactPhone','adWhatsapp','adShowPhone','adPlanId','adPlanCode','adPublishedAt','adExpiresAt','adFeaturedUntil','adPendingDays','adPendingFeatured','adRejectionReason','adReviewedById','adReviewedAt','adReminderSent','adViews','adContactClicks','adDeleted') OR COLUMN_NAME = @company_col)
 ORDER BY ORDINAL_POSITION;
