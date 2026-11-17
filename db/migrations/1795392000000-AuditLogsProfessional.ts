import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Journal d'audit professionnel : colonnes (auteur, catégorie, gravité, résultat, avant/après, contexte, signature) + index.
 *    Idempotente (vérifie chaque colonne / index). Script SQL équivalent : db/sql/audit_logs_professionnel.sql
 */
export class AuditLogsProfessional1795392000000 implements MigrationInterface {
  name = 'AuditLogsProfessional1795392000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS \`audit_logs\` (
  \`id\`           varchar(36)   NOT NULL,
  \`userId\`       varchar(255)  NULL,
  \`userName\`     varchar(150)  NULL,
  \`userRole\`     varchar(50)   NULL,
  \`companyId\`    varchar(36)   NULL,
  \`action\`       varchar(50)   NOT NULL,
  \`entity\`       varchar(100)  NOT NULL,
  \`entityId\`     varchar(255)  NULL,
  \`category\`     varchar(20)   NOT NULL DEFAULT 'BUSINESS',
  \`severity\`     varchar(10)   NOT NULL DEFAULT 'INFO',
  \`oldValue\`     json          NULL,
  \`newValue\`     json          NULL,
  \`changes\`      json          NULL,
  \`metadata\`     json          NULL,
  \`status\`       varchar(10)   NOT NULL DEFAULT 'SUCCESS',
  \`httpStatus\`   int           NULL,
  \`errorMessage\` varchar(1000) NULL,
  \`durationMs\`   int           NULL,
  \`ipAddress\`    varchar(45)   NULL,
  \`userAgent\`    varchar(500)  NULL,
  \`platform\`     varchar(20)   NULL,
  \`method\`       varchar(10)   NULL,
  \`route\`        varchar(255)  NULL,
  \`url\`          varchar(1000) NULL,
  \`requestId\`    varchar(64)   NULL,
  \`signature\`    varchar(64)   NULL,
  \`createdAt\`    datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

    const columns: [string, string][] = [
      ['userName', "varchar(150) NULL"],
      ['userRole', "varchar(50) NULL"],
      ['companyId', "varchar(36) NULL"],
      ['category', "varchar(20) NOT NULL DEFAULT 'BUSINESS'"],
      ['severity', "varchar(10) NOT NULL DEFAULT 'INFO'"],
      ['oldValue', "json NULL"],
      ['newValue', "json NULL"],
      ['changes', "json NULL"],
      ['metadata', "json NULL"],
      ['status', "varchar(10) NOT NULL DEFAULT 'SUCCESS'"],
      ['httpStatus', "int NULL"],
      ['errorMessage', "varchar(1000) NULL"],
      ['durationMs', "int NULL"],
      ['platform', "varchar(20) NULL"],
      ['method', "varchar(10) NULL"],
      ['route', "varchar(255) NULL"],
      ['url', "varchar(1000) NULL"],
      ['requestId', "varchar(64) NULL"],
      ['signature', "varchar(64) NULL"],
    ];
    for (const [name, def] of columns) {
      if (!(await q.hasColumn('audit_logs', name))) {
        await q.query(`ALTER TABLE \`audit_logs\` ADD COLUMN \`${name}\` ${def}`);
      }
    }

    const table = await q.getTable('audit_logs');
    const indexes: [string, string][] = [
      ['idx_audit_created', '\`createdAt\`'],
      ['idx_audit_user_created', '\`userId\`, \`createdAt\`'],
      ['idx_audit_entity', '\`entity\`, \`entityId\`'],
      ['idx_audit_action', '\`action\`'],
      ['idx_audit_category_created', '\`category\`, \`createdAt\`'],
      ['idx_audit_company_created', '\`companyId\`, \`createdAt\`'],
      ['idx_audit_status', '\`status\`'],
    ];
    for (const [name, cols] of indexes) {
      if (!table?.indices.some((i) => i.name === name)) {
        await q.query(`CREATE INDEX \`${name}\` ON \`audit_logs\` (${cols})`);
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    // Les colonnes et lignes du journal sont conservées volontairement (traçabilité).
  }
}
