-- ============================================================================
-- Tarifs de RAMASSAGE de colis (module indépendant) — base favor_db
-- Paliers dynamiques par pays/ville (1–10 = 2$, 11–20 = 3$, …).
-- country / city = RELATIONS vers countries / cities.
-- Exécuter chaque instruction séparément ; ignorer #1050 (table déjà présente)
-- et #1061 (index déjà présent) si tu relances.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pickup_tariffs` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(150) NULL,
  `countryId` VARCHAR(36) NOT NULL,
  `cityId` VARCHAR(36) NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_pickup_tariffs_zone` (`countryId`,`cityId`),
  CONSTRAINT `fk_pickup_tariff_country` FOREIGN KEY (`countryId`)
    REFERENCES `countries` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pickup_tariff_city` FOREIGN KEY (`cityId`)
    REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Si tu avais déjà créé la table AVEC la colonne `unit`, retire-la (ignore #1091 si absente) :
-- ALTER TABLE `pickup_tariffs` DROP COLUMN `unit`;

CREATE TABLE IF NOT EXISTS `pickup_tariff_tiers` (
  `id` VARCHAR(36) NOT NULL,
  `tariffId` VARCHAR(36) NOT NULL,
  `minValue` INT NOT NULL,
  `maxValue` INT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_pickup_tariff_tiers_tariff` (`tariffId`),
  CONSTRAINT `fk_pickup_tier_tariff` FOREIGN KEY (`tariffId`)
    REFERENCES `pickup_tariffs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- (Optionnel) Exemple : ville Goma, ramassage au nombre de colis
--   1–10 = 2$ ; 11–20 = 3$ ; 21–50 = 5$ ; 51+ = 10$
--   Remplace les SELECT par les id réels de ton pays / ta ville.
-- ---------------------------------------------------------------------------
-- SET @countryId := (SELECT id FROM countries WHERE name='RDC' LIMIT 1);
-- SET @cityId    := (SELECT id FROM cities    WHERE name='Goma' LIMIT 1);
-- SET @t := UUID();
-- INSERT INTO pickup_tariffs (id,name,countryId,cityId,unit,currency,isActive)
--   VALUES (@t,'Ramassage Goma',@countryId,@cityId,'QUANTITY','USD',1);
-- INSERT INTO pickup_tariff_tiers (id,tariffId,minValue,maxValue,price) VALUES
--   (UUID(),@t,1,10,2.00),
--   (UUID(),@t,11,20,3.00),
--   (UUID(),@t,21,50,5.00),
--   (UUID(),@t,51,NULL,10.00);
