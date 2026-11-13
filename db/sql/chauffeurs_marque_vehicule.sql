-- ============================================================
-- ✅ Véhicules des chauffeurs : marque (facultative)
-- Base : favor_db — si #1060 (colonne déjà là) : rien à faire
-- ============================================================
ALTER TABLE `driver_vehicles` ADD COLUMN `brand` varchar(100) NULL AFTER `categoryId`;
