-- ============================================================================
-- Tarification professionnelle des expéditions entre entreprises
-- - Chaque entreprise configure 2 tarifs : prix fournisseur et prix client
-- - Chaque colis enregistre les totaux calculés + un instantané des tarifs appliqués
--
-- Exécuter chaque instruction UNE par UNE.
-- Si une colonne existe déjà, MySQL renvoie l'erreur #1060 (Duplicate column) :
-- ignorez-la et passez à la suivante.
-- ============================================================================

-- 1) Paramètres entreprise : prix fournisseur et prix client
ALTER TABLE `company_settings` ADD COLUMN `supplierPrice` DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE `company_settings` ADD COLUMN `clientPrice` DECIMAL(10,2) NOT NULL DEFAULT 0;

-- 2) Colis : totaux calculés + instantané des tarifs (historique figé)
ALTER TABLE `shipments` ADD COLUMN `clientTotal` DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE `shipments` ADD COLUMN `supplierTotal` DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE `shipments` ADD COLUMN `pricingBreakdown` JSON NULL;
