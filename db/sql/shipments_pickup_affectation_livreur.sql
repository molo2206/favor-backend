-- ============================================================================
-- Shipments — Affectation du RAMASSAGE à un livreur (prise par le livreur ou
-- affectation côté admin). Base favor_db.
-- Exécuter chaque ALTER un par un ; ignorer #1060 (colonne déjà présente) si tu relances.
-- ============================================================================

-- Livreur affecté au ramassage (le premier qui le prend le garde)
ALTER TABLE `shipments` ADD COLUMN `pickupDelivererId` CHAR(36) NULL;

-- Qui a affecté : le livreur lui-même (prise) ou un admin (affectation)
ALTER TABLE `shipments` ADD COLUMN `pickupAssignedById` CHAR(36) NULL;

-- Date d'affectation
ALTER TABLE `shipments` ADD COLUMN `pickupAssignedAt` DATETIME(6) NULL;

-- Index de recherche des ramassages d'un livreur (ignorer #1061 si déjà créé)
ALTER TABLE `shipments` ADD INDEX `idx_shipments_pickupDelivererId` (`pickupDelivererId`);
