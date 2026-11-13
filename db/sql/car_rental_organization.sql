-- ============================================================================
-- Phase 2 — Location pour ORGANISATION : conditions + modes de paiement propriétaire
-- Additif. Exécuter une instruction à la fois ; ignorer #1060 (Duplicate column) si déjà présent.
-- (Le champ products.rentalCategory a été ajouté en Phase 1 — vehicle_technical_control.sql.)
-- ============================================================================

-- Conditions de location organisation (figées côté serveur) :
--   { "maintenanceAndDriverBy": "OWNER", "fuelBy": "CLIENT", "paymentAfterService": true }
ALTER TABLE `products` ADD COLUMN `organizationRentalTerms` JSON NULL;

-- Modes de paiement acceptés par le propriétaire pour ce véhicule (tableau de UserPaymentMethod.id)
ALTER TABLE `products` ADD COLUMN `ownerPaymentMethodIds` JSON NULL;
