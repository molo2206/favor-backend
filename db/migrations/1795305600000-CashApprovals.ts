import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Trésorerie : circuit de validation à plusieurs niveaux (règles, demandes, historique).
 *    Script SQL équivalent : db/sql/tresorerie_circuit_validation.sql
 */
export class CashApprovals1795305600000 implements MigrationInterface {
  name = 'CashApprovals1795305600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS \`bo_cash_approval_rules\` (
  \`id\`                varchar(36)   NOT NULL,
  \`companyId\`         varchar(36)   NOT NULL,
  \`name\`              varchar(120)  NOT NULL,
  \`description\`       varchar(500)  NULL,
  \`scope\`             varchar(10)   NOT NULL DEFAULT 'OUT' COMMENT 'OUT | IN | TRANSFER | ALL',
  \`minAmount\`         decimal(14,2) NOT NULL DEFAULT 0,
  \`maxAmount\`         decimal(14,2) NULL,
  \`currency\`          varchar(10)   NOT NULL DEFAULT 'USD',
  \`categoryIds\`       json          NULL,
  \`accountIds\`        json          NULL,
  \`levels\`            json          NOT NULL,
  \`applyToManagers\`   tinyint       NOT NULL DEFAULT 1,
  \`allowSelfApproval\` tinyint       NOT NULL DEFAULT 0,
  \`priority\`          int           NOT NULL DEFAULT 0,
  \`isActive\`          tinyint       NOT NULL DEFAULT 1,
  \`createdById\`       varchar(36)   NULL,
  \`createdAt\`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`idx_bo_car_company\` (\`companyId\`, \`isActive\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE IF NOT EXISTS \`bo_cash_approvals\` (
  \`id\`                 varchar(36)   NOT NULL,
  \`companyId\`          varchar(36)   NOT NULL,
  \`targetType\`         varchar(12)   NOT NULL COMMENT 'TRANSACTION | TRANSFER',
  \`targetId\`           varchar(36)   NOT NULL,
  \`reference\`          varchar(40)   NOT NULL,
  \`direction\`          varchar(3)    NULL,
  \`amount\`             decimal(14,2) NOT NULL,
  \`currency\`           varchar(10)   NOT NULL,
  \`amountUsd\`          decimal(14,2) NULL,
  \`summary\`            varchar(255)  NULL,
  \`ruleId\`             varchar(36)   NULL,
  \`ruleName\`           varchar(120)  NULL,
  \`allowSelfApproval\`  tinyint       NOT NULL DEFAULT 0,
  \`levels\`             json          NOT NULL,
  \`currentLevel\`       int           NOT NULL DEFAULT 1,
  \`currentApproverIds\` json          NULL,
  \`status\`             varchar(12)   NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING | APPROVED | REJECTED | CANCELLED',
  \`requestedById\`      varchar(36)   NULL,
  \`decidedById\`        varchar(36)   NULL,
  \`decisionReason\`     varchar(500)  NULL,
  \`levelStartedAt\`     datetime(6)   NULL,
  \`lastNotifiedAt\`     datetime(6)   NULL,
  \`completedAt\`        datetime(6)   NULL,
  \`createdAt\`          datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\`          datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`idx_bo_ca_company_status\` (\`companyId\`, \`status\`),
  KEY \`idx_bo_ca_target\` (\`targetType\`, \`targetId\`),
  KEY \`idx_bo_ca_requester\` (\`requestedById\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE IF NOT EXISTS \`bo_cash_approval_steps\` (
  \`id\`         varchar(36)   NOT NULL,
  \`approvalId\` varchar(36)   NOT NULL,
  \`level\`      int           NOT NULL DEFAULT 0,
  \`action\`     varchar(20)   NOT NULL,
  \`userId\`     varchar(36)   NULL,
  \`comment\`    varchar(1000) NULL,
  \`payload\`    json          NULL,
  \`createdAt\`  datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`idx_bo_cas_approval\` (\`approvalId\`, \`createdAt\`),
  CONSTRAINT \`fk_bo_cas_approval\` FOREIGN KEY (\`approvalId\`) REFERENCES \`bo_cash_approvals\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `bo_cash_approval_steps`');
    await q.query('DROP TABLE IF EXISTS `bo_cash_approvals`');
    await q.query('DROP TABLE IF EXISTS `bo_cash_approval_rules`');
  }
}
