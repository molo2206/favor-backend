-- ============================================================
-- ATTRIBUTS ↔ PRODUITS ↔ COMMANDES — SCRIPT COMPLET MySQL 8
-- À exécuter EN UNE SEULE FOIS (phpMyAdmin > onglet SQL, ou client mysql).
-- Peut être relancé sans erreur : chaque ajout vérifie d'abord s'il existe déjà.
-- Les colonnes de clés étrangères recopient le type / charset / collation exacts
-- des colonnes `id` référencées (évite l'erreur #3780).
-- ============================================================

-- ============================================================
-- 0. Définition exacte des colonnes `id` référencées
-- ============================================================
SET @pa_id = COALESCE((SELECT CONCAT_WS(' ', COLUMN_TYPE, CONCAT('CHARACTER SET ', CHARACTER_SET_NAME), CONCAT('COLLATE ', COLLATION_NAME))
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_attributes' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @p_id = COALESCE((SELECT CONCAT_WS(' ', COLUMN_TYPE, CONCAT('CHARACTER SET ', CHARACTER_SET_NAME), CONCAT('COLLATE ', COLLATION_NAME))
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @a_id = COALESCE((SELECT CONCAT_WS(' ', COLUMN_TYPE, CONCAT('CHARACTER SET ', CHARACTER_SET_NAME), CONCAT('COLLATE ', COLLATION_NAME))
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attributes' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @av_id = COALESCE((SELECT CONCAT_WS(' ', COLUMN_TYPE, CONCAT('CHARACTER SET ', CHARACTER_SET_NAME), CONCAT('COLLATE ', COLLATION_NAME))
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attribute_values' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @pv_id = COALESCE((SELECT CONCAT_WS(' ', COLUMN_TYPE, CONCAT('CHARACTER SET ', CHARACTER_SET_NAME), CONCAT('COLLATE ', COLLATION_NAME))
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variations' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @oi_id = COALESCE((SELECT CONCAT_WS(' ', COLUMN_TYPE, CONCAT('CHARACTER SET ', CHARACTER_SET_NAME), CONCAT('COLLATE ', COLLATION_NAME))
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @o_id = COALESCE((SELECT CONCAT_WS(' ', COLUMN_TYPE, CONCAT('CHARACTER SET ', CHARACTER_SET_NAME), CONCAT('COLLATE ', COLLATION_NAME))
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');

SET @TXT = 'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';

-- ============================================================
-- 1. attributes
-- ============================================================
ALTER TABLE `attributes`
  MODIFY COLUMN `type` enum('TEXT','COLOR','IMAGE','SELECT','NUMBER','BOOLEAN') NOT NULL;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attributes' AND COLUMN_NAME = 'isVariant') = 0,
  'ALTER TABLE `attributes` ADD COLUMN `isVariant` tinyint NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attributes' AND COLUMN_NAME = 'isVisible') = 0,
  'ALTER TABLE `attributes` ADD COLUMN `isVisible` tinyint NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attributes' AND COLUMN_NAME = 'isActive') = 0,
  'ALTER TABLE `attributes` ADD COLUMN `isActive` tinyint NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attributes' AND COLUMN_NAME = 'unit') = 0,
  CONCAT('ALTER TABLE `attributes` ADD COLUMN `unit` varchar(50) ', @TXT, ' NULL'), 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attributes' AND COLUMN_NAME = 'position') = 0,
  'ALTER TABLE `attributes` ADD COLUMN `position` int NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attributes' AND COLUMN_NAME = 'deletedAt') = 0,
  'ALTER TABLE `attributes` ADD COLUMN `deletedAt` datetime(6) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `attributes` SET `isVariant` = 0 WHERE `type` = 'TEXT';

-- ============================================================
-- 2. attribute_values
-- ============================================================
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attribute_values' AND COLUMN_NAME = 'isActive') = 0,
  'ALTER TABLE `attribute_values` ADD COLUMN `isActive` tinyint NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. product_attributes
-- ============================================================
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_attributes' AND COLUMN_NAME = 'isRequired') = 0,
  'ALTER TABLE `product_attributes` ADD COLUMN `isRequired` tinyint NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_attributes' AND COLUMN_NAME = 'isVariant') = 0,
  'ALTER TABLE `product_attributes` ADD COLUMN `isVariant` tinyint NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_attributes' AND COLUMN_NAME = 'isVisible') = 0,
  'ALTER TABLE `product_attributes` ADD COLUMN `isVisible` tinyint NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_attributes' AND COLUMN_NAME = 'position') = 0,
  'ALTER TABLE `product_attributes` ADD COLUMN `position` int NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_attributes' AND COLUMN_NAME = 'customValue') = 0,
  CONCAT('ALTER TABLE `product_attributes` ADD COLUMN `customValue` varchar(255) ', @TXT, ' NULL'), 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_attributes' AND COLUMN_NAME = 'createdAt') = 0,
  'ALTER TABLE `product_attributes` ADD COLUMN `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_attributes' AND COLUMN_NAME = 'updatedAt') = 0,
  'ALTER TABLE `product_attributes` ADD COLUMN `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 4. product_variations
-- ============================================================
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variations' AND COLUMN_NAME = 'name') = 0,
  CONCAT('ALTER TABLE `product_variations` ADD COLUMN `name` varchar(255) ', @TXT, ' NULL'), 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variations' AND COLUMN_NAME = 'isDefault') = 0,
  'ALTER TABLE `product_variations` ADD COLUMN `isDefault` tinyint NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variations' AND COLUMN_NAME = 'position') = 0,
  'ALTER TABLE `product_variations` ADD COLUMN `position` int NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variations' AND COLUMN_NAME = 'deletedAt') = 0,
  'ALTER TABLE `product_variations` ADD COLUMN `deletedAt` datetime(6) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 5. product_attribute_values (NOUVELLE TABLE)
-- ============================================================
SET @sql = CONCAT(
  'CREATE TABLE IF NOT EXISTS `product_attribute_values` (',
  '`id` varchar(36) NOT NULL,',
  '`productAttributeId` ', @pa_id, ' NOT NULL,',
  '`productId` ', @p_id, ' NOT NULL,',
  '`attributeId` ', @a_id, ' NOT NULL,',
  '`attributeValueId` ', @av_id, ' NOT NULL,',
  '`priceAdjustment` decimal(10,2) NOT NULL DEFAULT 0,',
  '`isDefault` tinyint NOT NULL DEFAULT 0,',
  '`isActive` tinyint NOT NULL DEFAULT 1,',
  '`position` int NOT NULL DEFAULT 0,',
  '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
  '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),',
  'PRIMARY KEY (`id`),',
  'UNIQUE INDEX `uq_pav_product_attribute_value` (`productAttributeId`, `attributeValueId`),',
  'INDEX `idx_pav_product` (`productId`),',
  'INDEX `idx_pav_attribute` (`attributeId`),',
  'INDEX `idx_pav_value` (`attributeValueId`),',
  'CONSTRAINT `FK_pav_product_attribute` FOREIGN KEY (`productAttributeId`) REFERENCES `product_attributes`(`id`) ON DELETE CASCADE,',
  'CONSTRAINT `FK_pav_product` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE,',
  'CONSTRAINT `FK_pav_attribute` FOREIGN KEY (`attributeId`) REFERENCES `attributes`(`id`) ON DELETE CASCADE,',
  'CONSTRAINT `FK_pav_attribute_value` FOREIGN KEY (`attributeValueId`) REFERENCES `attribute_values`(`id`) ON DELETE CASCADE',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 6. order_items
-- ============================================================
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'variationId') = 0,
  CONCAT('ALTER TABLE `order_items` ADD COLUMN `variationId` ', @pv_id, ' NULL'), 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'sku') = 0,
  CONCAT('ALTER TABLE `order_items` ADD COLUMN `sku` varchar(255) ', @TXT, ' NULL'), 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'variationLabel') = 0,
  CONCAT('ALTER TABLE `order_items` ADD COLUMN `variationLabel` varchar(500) ', @TXT, ' NULL'), 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'attributesSnapshot') = 0,
  'ALTER TABLE `order_items` ADD COLUMN `attributesSnapshot` json NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND INDEX_NAME = 'idx_order_items_variation') = 0,
  'CREATE INDEX `idx_order_items_variation` ON `order_items` (`variationId`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND CONSTRAINT_NAME = 'FK_order_items_variation') = 0,
  'ALTER TABLE `order_items` ADD CONSTRAINT `FK_order_items_variation` FOREIGN KEY (`variationId`) REFERENCES `product_variations`(`id`) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 6 bis. sub_order_items
-- ============================================================
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sub_order_items' AND COLUMN_NAME = 'variationId') = 0,
  CONCAT('ALTER TABLE `sub_order_items` ADD COLUMN `variationId` ', @pv_id, ' NULL'), 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sub_order_items' AND COLUMN_NAME = 'sku') = 0,
  CONCAT('ALTER TABLE `sub_order_items` ADD COLUMN `sku` varchar(255) ', @TXT, ' NULL'), 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sub_order_items' AND COLUMN_NAME = 'variationLabel') = 0,
  CONCAT('ALTER TABLE `sub_order_items` ADD COLUMN `variationLabel` varchar(500) ', @TXT, ' NULL'), 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sub_order_items' AND COLUMN_NAME = 'attributesSnapshot') = 0,
  'ALTER TABLE `sub_order_items` ADD COLUMN `attributesSnapshot` json NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sub_order_items' AND INDEX_NAME = 'idx_sub_order_items_variation') = 0,
  'CREATE INDEX `idx_sub_order_items_variation` ON `sub_order_items` (`variationId`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sub_order_items' AND CONSTRAINT_NAME = 'FK_sub_order_items_variation') = 0,
  'ALTER TABLE `sub_order_items` ADD CONSTRAINT `FK_sub_order_items_variation` FOREIGN KEY (`variationId`) REFERENCES `product_variations`(`id`) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 7. order_item_attributes (NOUVELLE TABLE)
-- ============================================================
SET @sql = CONCAT(
  'CREATE TABLE IF NOT EXISTS `order_item_attributes` (',
  '`id` varchar(36) NOT NULL,',
  '`orderItemId` ', @oi_id, ' NOT NULL,',
  '`orderId` ', @o_id, ' NOT NULL,',
  '`attributeId` ', @a_id, ' NULL,',
  '`attributeValueId` ', @av_id, ' NULL,',
  '`attributeName` varchar(255) ', @TXT, ' NOT NULL,',
  '`attributeSlug` varchar(255) ', @TXT, ' NULL,',
  '`attributeType` varchar(30) NULL,',
  '`value` varchar(255) ', @TXT, ' NOT NULL,',
  '`displayName` varchar(255) ', @TXT, ' NULL,',
  '`color` varchar(50) NULL,',
  '`imageUrl` varchar(500) NULL,',
  '`priceAdjustment` decimal(10,2) NOT NULL DEFAULT 0,',
  '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),',
  'PRIMARY KEY (`id`),',
  'INDEX `idx_oia_order_item` (`orderItemId`),',
  'INDEX `idx_oia_order` (`orderId`),',
  'INDEX `idx_oia_attribute` (`attributeId`),',
  'INDEX `idx_oia_attribute_value` (`attributeValueId`),',
  'CONSTRAINT `FK_oia_order_item` FOREIGN KEY (`orderItemId`) REFERENCES `order_items`(`id`) ON DELETE CASCADE,',
  'CONSTRAINT `FK_oia_attribute` FOREIGN KEY (`attributeId`) REFERENCES `attributes`(`id`) ON DELETE SET NULL,',
  'CONSTRAINT `FK_oia_attribute_value` FOREIGN KEY (`attributeValueId`) REFERENCES `attribute_values`(`id`) ON DELETE SET NULL',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 8. Reprise des données existantes
--    (attributs / valeurs déjà utilisés par des variations)
-- ============================================================
INSERT INTO `product_attributes` (`id`, `productId`, `attributeId`, `isRequired`, `isVariant`, `isVisible`, `position`)
SELECT UUID(), src.productId, src.attributeId, 0, 1, 1, 0
  FROM (SELECT DISTINCT pv.`productId` AS productId, vav.`attributeId` AS attributeId
          FROM `variation_attribute_values` vav
          JOIN `product_variations` pv ON pv.`id` = vav.`variationId`) src
 WHERE NOT EXISTS (SELECT 1 FROM `product_attributes` pa
                    WHERE pa.`productId` = src.productId AND pa.`attributeId` = src.attributeId);

INSERT INTO `product_attribute_values`
  (`id`, `productAttributeId`, `productId`, `attributeId`, `attributeValueId`, `priceAdjustment`, `isDefault`, `isActive`, `position`)
SELECT UUID(), pa.`id`, src.productId, src.attributeId, src.attributeValueId, 0, 0, 1, 0
  FROM (SELECT DISTINCT pv.`productId` AS productId, vav.`attributeId` AS attributeId, vav.`attributeValueId` AS attributeValueId
          FROM `variation_attribute_values` vav
          JOIN `product_variations` pv ON pv.`id` = vav.`variationId`) src
  JOIN `product_attributes` pa ON pa.`productId` = src.productId AND pa.`attributeId` = src.attributeId
 WHERE NOT EXISTS (SELECT 1 FROM `product_attribute_values` x
                    WHERE x.`productAttributeId` = pa.`id` AND x.`attributeValueId` = src.attributeValueId);

-- ============================================================
-- 9. Vérification
-- ============================================================
SELECT 'product_attribute_values' AS table_name, COUNT(*) AS lignes FROM `product_attribute_values`
UNION ALL
SELECT 'order_item_attributes', COUNT(*) FROM `order_item_attributes`;
