-- =====================================================================
-- ATELIER DE COUTURE — type d'entreprise sur-mesure + prix par taille + commission.
-- À exécuter UNE fois, AVANT de créer une entreprise de type ATELIER_COUTURE.
-- Sûr : ajouter une valeur à un ENUM ne modifie aucune ligne existante.
-- =====================================================================

-- 1) Ajout de la valeur ATELIER_COUTURE aux colonnes ENUM existantes
--    (on reprend TOUTES les valeurs actuelles + SYSTEM + ATELIER_COUTURE).
ALTER TABLE `company`
  MODIFY COLUMN `typeCompany`
  ENUM('RESTAURANT','CAR','GROCERY','SHOP','SERVICE','HOTEL','SHIPPING','AGENCE','LOGISTIC_AGENCY','TRANSPORT_AGENCY','TAXI','PHARMACIE','SYSTEM','ATELIER_COUTURE') NOT NULL;

ALTER TABLE `orders`
  MODIFY COLUMN `type`
  ENUM('RESTAURANT','CAR','GROCERY','SHOP','SERVICE','HOTEL','SHIPPING','AGENCE','LOGISTIC_AGENCY','TRANSPORT_AGENCY','TAXI','PHARMACIE','SYSTEM','ATELIER_COUTURE') NOT NULL;

ALTER TABLE `company_tariffs`
  MODIFY COLUMN `company_type`
  ENUM('RESTAURANT','CAR','GROCERY','SHOP','SERVICE','HOTEL','SHIPPING','AGENCE','LOGISTIC_AGENCY','TRANSPORT_AGENCY','TAXI','PHARMACIE','SYSTEM','ATELIER_COUTURE') NULL;

-- 2) Paliers de taille (supplément de prix selon la mesure)
CREATE TABLE IF NOT EXISTS `atelier_size_tiers` (
  `id`         VARCHAR(36)   NOT NULL,
  `companyId`  VARCHAR(36)   NOT NULL,
  `productId`  VARCHAR(36)   NULL,
  `measureKey` VARCHAR(80)   NULL,
  `minValue`   DECIMAL(10,2) NULL,
  `maxValue`   DECIMAL(10,2) NULL,
  `label`      VARCHAR(80)   NOT NULL,
  `surcharge`  DECIMAL(10,2) NOT NULL DEFAULT 0,
  `currency`   VARCHAR(10)   NOT NULL DEFAULT 'USD',
  `isActive`   TINYINT(1)    NOT NULL DEFAULT 1,
  `createdAt`  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_ast_company` (`companyId`),
  KEY `idx_ast_company_product` (`companyId`,`productId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Règles de commission plateforme (par type et/ou par entreprise)
CREATE TABLE IF NOT EXISTS `atelier_commissions` (
  `id`          VARCHAR(36)  NOT NULL,
  `companyId`   VARCHAR(36)  NULL,
  `companyType` ENUM('RESTAURANT','CAR','GROCERY','SHOP','SERVICE','HOTEL','SHIPPING','AGENCE','LOGISTIC_AGENCY','TRANSPORT_AGENCY','TAXI','PHARMACIE','SYSTEM','ATELIER_COUTURE') NULL,
  `ratePercent` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `minFee`      DECIMAL(10,2) NULL,
  `currency`    VARCHAR(10)  NOT NULL DEFAULT 'USD',
  `isActive`    TINYINT(1)   NOT NULL DEFAULT 1,
  `createdAt`   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt`   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_acom_company` (`companyId`),
  KEY `idx_acom_type` (`companyType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Trace de la répartition financière par commande (compta)
CREATE TABLE IF NOT EXISTS `atelier_order_charges` (
  `id`               VARCHAR(36)   NOT NULL,
  `orderId`          VARCHAR(36)   NOT NULL,
  `companyId`        VARCHAR(36)   NULL,
  `baseAmount`       DECIMAL(10,2) NOT NULL DEFAULT 0,
  `sizeSurcharge`    DECIMAL(10,2) NOT NULL DEFAULT 0,
  `confectionAmount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `commissionRate`   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  `commissionAmount` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `atelierAmount`    DECIMAL(10,2) NOT NULL DEFAULT 0,
  `currency`         VARCHAR(10)   NOT NULL DEFAULT 'USD',
  `createdAt`        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_aoc_order` (`orderId`),
  KEY `idx_aoc_company` (`companyId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) (Optionnel) Commission par défaut 10 % pour le type ATELIER_COUTURE.
--    À exécuter si tu veux un taux dès le départ ; sinon configure-le via le back-office.
INSERT INTO `atelier_commissions` (`id`,`companyId`,`companyType`,`ratePercent`,`minFee`,`currency`,`isActive`)
SELECT UUID(), NULL, 'ATELIER_COUTURE', 10.00, NULL, 'USD', 1
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `atelier_commissions`
  WHERE `companyId` IS NULL AND `companyType` = 'ATELIER_COUTURE'
);
