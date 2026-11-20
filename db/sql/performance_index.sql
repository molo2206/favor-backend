-- =====================================================================
-- PERFORMANCE : index pour les listes de l'administration (tri par date, filtre par rôle) — base favor_db
-- Ajout d'index uniquement (aucune donnée modifiée). Pas d'information_schema.
-- #1061 « Duplicate key name » : l'index existe déjà → passez à la ligne suivante.
-- Sur une grosse table, la création peut prendre quelques secondes (la table reste utilisable).
-- =====================================================================
CREATE INDEX `idx_perf_shipments_created` ON `shipments` (`createdAt`);
CREATE INDEX `idx_perf_users_created` ON `users` (`createdAt`);
CREATE INDEX `idx_perf_users_role` ON `users` (`role`);
CREATE INDEX `idx_perf_orders_created` ON `orders` (`createdAt`);
CREATE INDEX `idx_perf_orders_type_created` ON `orders` (`type`, `createdAt`);
CREATE INDEX `idx_perf_delivery_created` ON `delivery` (`createdAt`);

-- Mettre à jour les statistiques de MySQL (meilleurs plans de requête)
ANALYZE TABLE `shipments`, `users`, `orders`, `delivery`, `user_has_company`, `company`;
