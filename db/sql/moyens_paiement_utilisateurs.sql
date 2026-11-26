-- =====================================================================
-- MISE À JOUR — Moyens de paiement des utilisateurs (Mobile Money, FPay, Cash)
--   • Table user_payment_methods : chaque utilisateur enregistre ses moyens de paiement
--     (opérateur + numéro Mobile Money, compte FPay, espèces) et choisit celui par défaut.
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

-- Type exact de users.id (la clé étrangère exige le même type / jeu de caractères)
SET @ref_type = COALESCE((SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1), 'varchar(36)');
SET @ref_cs = (SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @ref_coll = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1);
SET @user_col = CONCAT(@ref_type, IF(@ref_cs IS NULL, '', CONCAT(' CHARACTER SET ', @ref_cs, ' COLLATE ', @ref_coll)));

-- 1) Table
SET @s = CONCAT('CREATE TABLE IF NOT EXISTS `', @db, '`.`user_payment_methods` (',
  '`id` varchar(36) NOT NULL, ',
  '`userId` ', @user_col, ' NOT NULL, ',
  '`type` enum(''MOBILE_MONEY'',''FPAY'',''CASH'') NOT NULL, ',
  '`label` varchar(80) NULL DEFAULT NULL, ',
  '`provider` varchar(60) NULL DEFAULT NULL, ',
  '`phone` varchar(30) NULL DEFAULT NULL, ',
  '`fpayAccount` varchar(120) NULL DEFAULT NULL, ',
  '`currency` varchar(10) NULL DEFAULT NULL, ',
  '`isDefault` tinyint NOT NULL DEFAULT 0, ',
  '`isActive` tinyint NOT NULL DEFAULT 1, ',
  '`lastUsedAt` datetime(6) NULL DEFAULT NULL, ',
  '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ',
  '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ',
  'PRIMARY KEY (`id`), ',
  'KEY `idx_upm_user` (`userId`, `isActive`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=', @cs, ' COLLATE=', @coll);
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Clé étrangère → users.id (suppression de l'utilisateur = suppression de ses moyens)
SET @fk_ok = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'user_payment_methods'
                 AND CONSTRAINT_NAME = 'fk_user_payment_methods_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0
             AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users') = 1;
SET @s = IF(@fk_ok,
  CONCAT('ALTER TABLE `', @db, '`.`user_payment_methods` ADD CONSTRAINT `fk_user_payment_methods_user` FOREIGN KEY (`userId`) REFERENCES `', @db, '`.`users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION'),
  'SELECT ''clé étrangère : déjà en place'' AS info');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT 'OK — moyens de paiement des utilisateurs prêts' AS resultat;
