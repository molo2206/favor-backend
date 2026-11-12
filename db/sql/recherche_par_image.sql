-- =====================================================================================
-- ✅ RECHERCHE PAR IMAGE : index sémantique des produits (embeddings)
--    Base favor_db : sélectionner favor_db dans phpMyAdmin avant d'exécuter.
--    1 NOUVELLE table + 2 index facultatifs. Aucune donnée existante modifiée. Ré-exécutable.
--    Sans information_schema. Erreurs #1061 (index déjà présent) : ignorer la ligne.
--    Migration équivalente : db/migrations/1796083200000-ImageSearch.ts
-- =====================================================================================

CREATE TABLE IF NOT EXISTS `product_search_embeddings` (
  `id`        varchar(36) NOT NULL,
  `productId` varchar(36) NOT NULL,
  `model`     varchar(60) NOT NULL,
  `dims`      int         NOT NULL,
  `vector`    mediumtext  NOT NULL COMMENT 'Float32 normalisé, base64',
  `textHash`  char(64)    NOT NULL,
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product_search_embedding` (`productId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Accélère le chargement de l'index (produits publiés, images avec empreinte)
ALTER TABLE `products` ADD INDEX `idx_products_status_search` (`status`);
ALTER TABLE `image_product_entity` ADD INDEX `idx_image_product_hash` (`productId`, `imageHashPhash`);

-- Vérification
SHOW TABLES LIKE 'product_search_embeddings';
