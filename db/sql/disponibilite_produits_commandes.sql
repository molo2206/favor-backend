-- =====================================================================================
-- ✅ Disponibilité des produits d'une commande, confirmée par leur propriétaire
--    Base : favor_db — 4 colonnes NULL ajoutées sur order_items, rien d'autre.
--    (si une colonne existe déjà, MySQL signale « Duplicate column » : ignorez simplement cette ligne)
-- =====================================================================================
USE `favor_db`;

ALTER TABLE `order_items`
  ADD COLUMN `availabilityStatus` enum('PENDING','AVAILABLE','UNAVAILABLE') NULL DEFAULT NULL,
  ADD COLUMN `availabilityConfirmedAt` datetime(6) NULL DEFAULT NULL,
  ADD COLUMN `availabilityConfirmedById` varchar(36) NULL DEFAULT NULL,
  ADD COLUMN `availabilityNote` varchar(500) NULL DEFAULT NULL;

-- Vérification : 4 lignes attendues
SELECT COLUMN_NAME, COLUMN_TYPE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME LIKE 'availability%';
