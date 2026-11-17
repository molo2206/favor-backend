-- =====================================================================
-- COLIS : DEVISE DES PRIX (table shipments) — base favor_db
-- Les colis existants reçoivent USD (comme avant). Pas d'information_schema.
-- #1060 « Duplicate column name » : la colonne existe déjà, rien à faire.
-- =====================================================================
ALTER TABLE `shipments` ADD COLUMN `currency` varchar(10) NOT NULL DEFAULT 'USD';

-- Contrôle
SELECT `currency`, COUNT(*) AS colis FROM `shipments` GROUP BY `currency`;
