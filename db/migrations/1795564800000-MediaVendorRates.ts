import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Médias — prestataires externes : domaines d'intervention, conditions particulières, prestations et tarifs.
 *    Idempotente. Script SQL équivalent : db/sql/media_prestataires_tarifs.sql
 */
export class MediaVendorRates1795564800000 implements MigrationInterface {
  name = 'MediaVendorRates1795564800000';

  public async up(q: QueryRunner): Promise<void> {
    const columns: [string, string][] = [
      ['domains', 'json NULL'],
      ['domainOther', 'varchar(150) NULL'],
      ['conditions', 'text NULL'],
    ];
    for (const [name, def] of columns) {
      if (!(await q.hasColumn('bo_media_vendors', name))) {
        await q.query(`ALTER TABLE \`bo_media_vendors\` ADD COLUMN \`${name}\` ${def}`);
      }
    }
    await q.query(`CREATE TABLE IF NOT EXISTS \`bo_media_vendor_rates\` (
  \`id\`          varchar(36)   NOT NULL,
  \`companyId\`   varchar(36)   NOT NULL,
  \`vendorId\`    varchar(36)   NOT NULL,
  \`name\`        varchar(150)  NOT NULL,
  \`description\` varchar(1000) NULL,
  \`domain\`      varchar(30)   NULL,
  \`category\`    varchar(30)   NULL,
  \`unit\`        varchar(20)   NOT NULL DEFAULT 'PROJECT',
  \`price\`       decimal(14,2) NOT NULL,
  \`currency\`    varchar(10)   NOT NULL DEFAULT 'USD',
  \`conditions\`  varchar(1000) NULL,
  \`isActive\`    tinyint       NOT NULL DEFAULT 1,
  \`sortOrder\`   int           NOT NULL DEFAULT 0,
  \`createdById\` varchar(36)   NULL,
  \`createdAt\`   datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\`   datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`idx_bo_media_vendor_rate_vendor\` (\`vendorId\`, \`isActive\`),
  KEY \`idx_bo_media_vendor_rate_company\` (\`companyId\`, \`domain\`, \`isActive\`),
  CONSTRAINT \`fk_bo_media_vendor_rate_vendor\` FOREIGN KEY (\`vendorId\`) REFERENCES \`bo_media_vendors\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `bo_media_vendor_rates`');
  }
}
