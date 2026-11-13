import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ BackOffice — Trésorerie (cash flow) : comptes, rubriques, mouvements, transferts,
 *    prévisions, arrêtés de caisse, équipe finance. Script SQL équivalent : db/sql/tresorerie_cash_flow.sql
 */
export class CashFlow1795219200000 implements MigrationInterface {
  name = 'CashFlow1795219200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS \`bo_finance_members\` (
  \`id\`          varchar(36) NOT NULL,
  \`companyId\`   varchar(36) NOT NULL,
  \`userId\`      varchar(36) NOT NULL,
  \`role\`        varchar(10) NOT NULL DEFAULT 'CASHIER' COMMENT 'MANAGER | CASHIER | VIEWER',
  \`accountIds\`  json        NULL COMMENT 'Caissier limité à ces comptes (vide = tous)',
  \`createdById\` varchar(36) NULL,
  \`createdAt\`   datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_bo_finance_member\` (\`companyId\`, \`userId\`),
  KEY \`idx_bo_finance_member_user\` (\`userId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE IF NOT EXISTS \`bo_cash_accounts\` (
  \`id\`             varchar(36)   NOT NULL,
  \`companyId\`      varchar(36)   NOT NULL,
  \`branchId\`       varchar(36)   NULL,
  \`name\`           varchar(150)  NOT NULL,
  \`type\`           varchar(20)   NOT NULL DEFAULT 'CASH' COMMENT 'CASH | BANK | MOBILE_MONEY | FPAY | OTHER',
  \`currency\`       varchar(10)   NOT NULL DEFAULT 'USD',
  \`bankName\`       varchar(150)  NULL,
  \`accountNumber\`  varchar(100)  NULL,
  \`openingBalance\` decimal(14,2) NOT NULL DEFAULT 0,
  \`openingDate\`    date          NULL,
  \`allowNegative\`  tinyint(1)    NOT NULL DEFAULT 0,
  \`minBalance\`     decimal(14,2) NULL,
  \`isActive\`       tinyint(1)    NOT NULL DEFAULT 1,
  \`isDefault\`      tinyint(1)    NOT NULL DEFAULT 0,
  \`color\`          varchar(20)   NULL,
  \`notes\`          text          NULL,
  \`createdById\`    varchar(36)   NULL,
  \`createdAt\`      datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\`      datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`idx_bo_cash_accounts_company\` (\`companyId\`, \`isActive\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE IF NOT EXISTS \`bo_cash_categories\` (
  \`id\`        varchar(36)  NOT NULL,
  \`companyId\` varchar(36)  NOT NULL,
  \`parentId\`  varchar(36)  NULL,
  \`name\`      varchar(150) NOT NULL,
  \`code\`      varchar(40)  NULL,
  \`direction\` varchar(3)   NOT NULL COMMENT 'IN | OUT',
  \`activity\`  varchar(20)  NOT NULL DEFAULT 'OPERATING' COMMENT 'OPERATING | INVESTING | FINANCING',
  \`color\`     varchar(20)  NULL,
  \`isActive\`  tinyint(1)   NOT NULL DEFAULT 1,
  \`isSystem\`  tinyint(1)   NOT NULL DEFAULT 0,
  \`position\`  int          NOT NULL DEFAULT 0,
  \`createdAt\` datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\` datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`idx_bo_cash_categories_company\` (\`companyId\`, \`direction\`, \`isActive\`),
  KEY \`idx_bo_cash_categories_parent\` (\`parentId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE IF NOT EXISTS \`bo_cash_transactions\` (
  \`id\`                 varchar(36)   NOT NULL,
  \`companyId\`          varchar(36)   NOT NULL,
  \`reference\`          varchar(40)   NOT NULL,
  \`accountId\`          varchar(36)   NOT NULL,
  \`categoryId\`         varchar(36)   NULL,
  \`direction\`          varchar(3)    NOT NULL COMMENT 'IN | OUT',
  \`amount\`             decimal(14,2) NOT NULL,
  \`currency\`           varchar(10)   NOT NULL,
  \`transactionDate\`    date          NOT NULL,
  \`status\`             varchar(20)   NOT NULL DEFAULT 'VALIDATED' COMMENT 'PENDING | VALIDATED | REJECTED | CANCELLED',
  \`paymentMethod\`      varchar(20)   NULL,
  \`counterpartyName\`   varchar(150)  NULL,
  \`counterpartyPhone\`  varchar(40)   NULL,
  \`description\`        varchar(500)  NULL,
  \`documentNumber\`     varchar(100)  NULL,
  \`attachmentUrl\`      varchar(500)  NULL,
  \`branchId\`           varchar(36)   NULL,
  \`transferId\`         varchar(36)   NULL,
  \`closingId\`          varchar(36)   NULL,
  \`sourceType\`         varchar(40)   NULL,
  \`sourceId\`           varchar(36)   NULL,
  \`createdById\`        varchar(36)   NULL,
  \`validatedById\`      varchar(36)   NULL,
  \`validatedAt\`        datetime(6)   NULL,
  \`rejectionReason\`    varchar(500)  NULL,
  \`cancelledById\`      varchar(36)   NULL,
  \`cancelledAt\`        datetime(6)   NULL,
  \`cancellationReason\` varchar(500)  NULL,
  \`createdAt\`          datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\`          datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_bo_cash_tx_reference\` (\`reference\`),
  KEY \`idx_bo_cash_tx_company_date\` (\`companyId\`, \`transactionDate\`),
  KEY \`idx_bo_cash_tx_account_status\` (\`accountId\`, \`status\`, \`transactionDate\`),
  KEY \`idx_bo_cash_tx_category\` (\`categoryId\`),
  KEY \`idx_bo_cash_tx_transfer\` (\`transferId\`),
  KEY \`idx_bo_cash_tx_source\` (\`sourceType\`, \`sourceId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE IF NOT EXISTS \`bo_cash_transfers\` (
  \`id\`             varchar(36)   NOT NULL,
  \`companyId\`      varchar(36)   NOT NULL,
  \`reference\`      varchar(40)   NOT NULL,
  \`fromAccountId\`  varchar(36)   NOT NULL,
  \`toAccountId\`    varchar(36)   NOT NULL,
  \`amount\`         decimal(14,2) NOT NULL,
  \`fromCurrency\`   varchar(10)   NOT NULL,
  \`toCurrency\`     varchar(10)   NOT NULL,
  \`exchangeRate\`   decimal(18,6) NOT NULL DEFAULT 1,
  \`receivedAmount\` decimal(14,2) NOT NULL,
  \`fees\`           decimal(14,2) NOT NULL DEFAULT 0,
  \`transferDate\`   date          NOT NULL,
  \`status\`         varchar(20)   NOT NULL DEFAULT 'VALIDATED',
  \`description\`    varchar(500)  NULL,
  \`createdById\`    varchar(36)   NULL,
  \`createdAt\`      datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_bo_cash_transfer_reference\` (\`reference\`),
  KEY \`idx_bo_cash_transfers_company\` (\`companyId\`, \`transferDate\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE IF NOT EXISTS \`bo_cash_forecasts\` (
  \`id\`          varchar(36)   NOT NULL,
  \`companyId\`   varchar(36)   NOT NULL,
  \`categoryId\`  varchar(36)   NOT NULL,
  \`period\`      varchar(7)    NOT NULL COMMENT 'AAAA-MM',
  \`amount\`      decimal(14,2) NOT NULL,
  \`currency\`    varchar(10)   NOT NULL DEFAULT 'USD',
  \`notes\`       varchar(500)  NULL,
  \`createdById\` varchar(36)   NULL,
  \`createdAt\`   datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\`   datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_bo_cash_forecast\` (\`companyId\`, \`categoryId\`, \`period\`, \`currency\`),
  KEY \`idx_bo_cash_forecast_period\` (\`companyId\`, \`period\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE IF NOT EXISTS \`bo_cash_closings\` (
  \`id\`                      varchar(36)   NOT NULL,
  \`companyId\`               varchar(36)   NOT NULL,
  \`reference\`               varchar(40)   NOT NULL,
  \`accountId\`               varchar(36)   NOT NULL,
  \`closingDate\`             date          NOT NULL,
  \`currency\`                varchar(10)   NOT NULL,
  \`expectedBalance\`         decimal(14,2) NOT NULL,
  \`countedBalance\`          decimal(14,2) NOT NULL,
  \`difference\`              decimal(14,2) NOT NULL,
  \`denominations\`           json          NULL,
  \`adjustmentTransactionId\` varchar(36)   NULL,
  \`notes\`                   text          NULL,
  \`closedById\`              varchar(36)   NULL,
  \`createdAt\`               datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_bo_cash_closing_reference\` (\`reference\`),
  KEY \`idx_bo_cash_closings_account\` (\`accountId\`, \`closingDate\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['bo_cash_closings', 'bo_cash_forecasts', 'bo_cash_transfers', 'bo_cash_transactions', 'bo_cash_categories', 'bo_cash_accounts', 'bo_finance_members']) {
      await q.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
  }
}
