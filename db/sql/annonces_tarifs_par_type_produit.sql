-- =====================================================================
-- MISE À JOUR — Annonces : tarifs de publication PAR TYPE DE PRODUIT
--   • classified_pricing_plans.productType : RESTAURANT, CAR, GROCERY, SHOP, SERVICE, HOTEL, SHIPPING, AGENCE
--     (NULL = tarif valable pour tous les types de produit — les tarifs existants restent valables)
-- MySQL 8 — SANS procédure stockée — idempotent (peut être relancé).
-- ✅ Base détectée automatiquement (celle qui contient `classified_pricing_plans`).
-- ⚠️ Exécuter le fichier EN ENTIER, en une seule fois.
-- =====================================================================

SET @db = (SELECT TABLE_SCHEMA FROM information_schema.TABLES
            WHERE TABLE_NAME = 'classified_pricing_plans'
              AND TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY TABLE_SCHEMA LIMIT 1);
-- Pour forcer une base précise, décommentez :
-- SET @db = 'nom_de_votre_base';

-- ⚠️ Contrôle : doit afficher le nom de VOTRE base (NULL = exécutez d'abord annonces_classifieds.sql)
SELECT @db AS base_modifiee;

-- 1) Colonne productType
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_pricing_plans' AND COLUMN_NAME = 'productType') = 0,
  CONCAT('ALTER TABLE `', @db, '`.`classified_pricing_plans` ADD COLUMN `productType` varchar(30) NULL DEFAULT NULL AFTER `description`'),
  'SELECT ''classified_pricing_plans.productType : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Index
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classified_pricing_plans' AND INDEX_NAME = 'idx_classified_plan_type') = 0,
  CONCAT('CREATE INDEX `idx_classified_plan_type` ON `', @db, '`.`classified_pricing_plans` (`productType`, `isActive`)'),
  'SELECT ''idx_classified_plan_type : existe déjà'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3) Valeurs en majuscules (sécurité si des lignes ont été saisies à la main)
SET @s = CONCAT('UPDATE `', @db, '`.`classified_pricing_plans` SET `productType` = UPPER(TRIM(`productType`)) WHERE `productType` IS NOT NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Exemple (à adapter) : tarif STANDARD_7J pour les voitures, valable partout
-- INSERT INTO classified_pricing_plans (id, code, name, productType, durationDays, price, currency, isFeatured, maxImages, isActive, sortOrder, createdAt, updatedAt)
-- VALUES (UUID(), 'STANDARD_7J', 'Standard 7 jours — Voiture', 'CAR', 7, 10, 'USD', 0, 15, 1, 0, NOW(6), NOW(6));

SELECT 'OK — tarifs des annonces par type de produit prêts' AS resultat;
