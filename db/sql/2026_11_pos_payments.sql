-- =====================================================================
-- POS : paiements crédit / partiel / multiple + téléphone client
-- À exécuter APRÈS 2026_11_pos.sql.
-- ✅ RÉ-EXÉCUTABLE sans risque : chaque colonne / index n'est ajouté que s'il manque
--    (MySQL n'accepte pas « ADD COLUMN IF NOT EXISTS » : vérification via information_schema).
-- =====================================================================

DROP PROCEDURE IF EXISTS `pos_payments_migration`;

DELIMITER $$
CREATE PROCEDURE `pos_payments_migration`()
BEGIN
  -- 1) Colonnes de règlement sur la vente
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_sales' AND COLUMN_NAME = 'customerPhone') THEN
    ALTER TABLE `pos_sales` ADD COLUMN `customerPhone` VARCHAR(40) NULL AFTER `customerName`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_sales' AND COLUMN_NAME = 'amountPaid') THEN
    ALTER TABLE `pos_sales` ADD COLUMN `amountPaid` DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER `status`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_sales' AND COLUMN_NAME = 'amountDue') THEN
    ALTER TABLE `pos_sales` ADD COLUMN `amountDue` DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER `amountPaid`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_sales' AND COLUMN_NAME = 'paymentStatus') THEN
    ALTER TABLE `pos_sales` ADD COLUMN `paymentStatus` ENUM('PAID','PARTIAL','CREDIT','UNPAID') NOT NULL DEFAULT 'PAID' AFTER `amountDue`;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pos_sales' AND INDEX_NAME = 'idx_pos_sale_due') THEN
    ALTER TABLE `pos_sales` ADD INDEX `idx_pos_sale_due` (`companyId`,`amountDue`);
  END IF;

  -- Ventes déjà enregistrées avant ce script : entièrement payées
  UPDATE `pos_sales` SET `amountPaid` = `total` WHERE `amountPaid` = 0 AND `amountDue` = 0 AND `total` > 0 AND `paymentStatus` = 'PAID';
END$$
DELIMITER ;

CALL `pos_payments_migration`();
DROP PROCEDURE IF EXISTS `pos_payments_migration`;

-- 2) Règlements rattachés à une vente (un ou plusieurs)
CREATE TABLE IF NOT EXISTS `pos_sale_payments` (
  `id`         VARCHAR(36)   NOT NULL,
  `companyId`  VARCHAR(36)   NOT NULL,
  `saleId`     VARCHAR(36)   NOT NULL,
  `method`     ENUM('CASH','FPAY','MOBILE_MONEY','CARD','OTHER') NOT NULL DEFAULT 'CASH',
  `amount`     DECIMAL(14,2) NOT NULL DEFAULT 0,
  `reference`  VARCHAR(100)  NULL,
  `paidById`   VARCHAR(36)   NULL,
  `source`     ENUM('ONLINE','OFFLINE') NOT NULL DEFAULT 'ONLINE',
  `clientOpId` VARCHAR(80)   NULL,
  `createdAt`  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_payment_client_op` (`saleId`,`clientOpId`),
  KEY `idx_pos_payment_sale` (`saleId`),
  KEY `idx_pos_payment_company` (`companyId`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
