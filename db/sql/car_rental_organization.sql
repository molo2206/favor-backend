-- ============================================================================
-- Phase 2 — Location ORGANISATION : catégorie (+BOTH), conditions, modes de paiement propriétaire
-- Additif. Exécuter une instruction à la fois ; ignorer #1060 (Duplicate column) si déjà présent.
-- ============================================================================

-- 1) rentalCategory : ajouter la valeur BOTH (à la fois privé ET organisation)
ALTER TABLE `products` MODIFY COLUMN `rentalCategory` ENUM('PRIVATE','ORGANIZATION','BOTH') NULL DEFAULT 'PRIVATE';

-- 2) Conditions de location organisation (figées côté serveur) :
--    { "maintenanceAndDriverBy": "OWNER", "fuelBy": "CLIENT", "paymentAfterService": true }
ALTER TABLE `products` ADD COLUMN `organizationRentalTerms` JSON NULL;

-- 3) Modes de paiement acceptés par le propriétaire (liste d'objets) :
--    [{ "type": "FPAY|MOBILE_MONEY|BANK|CASH", "mobileMoneyNumber"?, "bankAccountNumber"?, "fpayNumber"? }]
ALTER TABLE `products` ADD COLUMN `ownerPaymentMethods` JSON NULL;

-- 4) Retirer l'ancienne colonne si une version précédente l'avait créée
--    (si la colonne n'existe pas, ignorez l'erreur #1091 Can't DROP).
ALTER TABLE `products` DROP COLUMN `ownerPaymentMethodIds`;
