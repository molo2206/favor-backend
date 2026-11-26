-- =====================================================================
-- POS : paiements crédit / partiel / multiple + téléphone client
-- À exécuter APRÈS 2026_11_pos.sql.
-- ⚠️ Script à exécuter UNE SEULE FOIS (les ALTER/CREATE INDEX ci-dessous
--    ne sont pas ré-exécutables : relancer donnerait « Duplicate column/key »).
-- =====================================================================

-- 1) Colonnes de règlement sur la vente
ALTER TABLE `pos_sales`
  ADD COLUMN `customerPhone`  VARCHAR(40)   NULL AFTER `customerName`,
  ADD COLUMN `amountPaid`     DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER `status`,
  ADD COLUMN `amountDue`      DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER `amountPaid`,
  ADD COLUMN `paymentStatus`  ENUM('PAID','PARTIAL','CREDIT','UNPAID') NOT NULL DEFAULT 'PAID' AFTER `amountDue`,
  ADD INDEX  `idx_pos_sale_due` (`companyId`,`amountDue`);

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
