-- ============================================================================
-- Taxi / Courses — Suivi en direct (Sections 2 à 5)
-- À exécuter sur la base favor_db.
-- NOTE (utilisateur admin sans information_schema) : exécuter chaque ALTER un par un.
--   Ignorer les erreurs #1060 (colonne déjà présente), #1061 (index déjà présent)
--   et #1091 (impossible de supprimer, n'existe pas) : la colonne/l'index existe déjà.
-- ============================================================================

-- ---- Section 3 : attente payante du chauffeur (après ARRIVED) --------------
ALTER TABLE `rides` ADD COLUMN `waitingStartedAt` DATETIME(6) NULL;
ALTER TABLE `rides` ADD COLUMN `waitingChargedSec` INT NULL;
ALTER TABLE `rides` ADD COLUMN `waitingFeeAmount` DECIMAL(12,2) NULL;

-- ---- Section 3 : géorepérage (motif si action hors zone) -------------------
ALTER TABLE `rides` ADD COLUMN `arrivedOutsideReason` VARCHAR(255) NULL;
ALTER TABLE `rides` ADD COLUMN `completedOutsideReason` VARCHAR(255) NULL;

-- ---- Section 5 : code de prise en charge (PIN) + partage de trajet ---------
ALTER TABLE `rides` ADD COLUMN `pickupPin` VARCHAR(8) NULL;
ALTER TABLE `rides` ADD COLUMN `shareToken` VARCHAR(64) NULL;
ALTER TABLE `rides` ADD UNIQUE INDEX `uq_rides_share_token` (`shareToken`);

-- ---- Section 3 : tarif d'attente par catégorie ----------------------------
ALTER TABLE `pricings` ADD COLUMN `freeWaitingSec` INT NOT NULL DEFAULT 180;
ALTER TABLE `pricings` ADD COLUMN `waitingFeePerMin` DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ---- Section 5 : fiabilité — index de recherche des chauffeurs -------------
ALTER TABLE `driver_locations` ADD INDEX `idx_driver_loc_dispatch` (`isOnline`, `isBusy`, `updatedAt`);
