import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Sessions de connexion, bases MySQL des sauvegardes, photo du prestataire Médias.
 *    Idempotente. Script SQL équivalent : db/sql/sessions_sauvegardes_bases_photo_prestataire.sql
 */
export class SessionsBackupDatabasesVendorPhoto1795651200000 implements MigrationInterface {
  name = 'SessionsBackupDatabasesVendorPhoto1795651200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS \`user_sessions\` (
  \`id\`                  varchar(36)  NOT NULL,
  \`userId\`              varchar(36)  NOT NULL,
  \`loginMethod\`         varchar(20)  NOT NULL DEFAULT 'PASSWORD',
  \`ipAddress\`           varchar(45)  NULL,
  \`userAgent\`           varchar(500) NULL,
  \`platform\`            varchar(20)  NULL,
  \`deviceId\`            varchar(150) NULL,
  \`deviceName\`          varchar(150) NULL,
  \`appVersion\`          varchar(30)  NULL,
  \`refreshTokenHash\`    varchar(64)  NULL,
  \`previousRefreshHash\` varchar(64)  NULL,
  \`refreshRotatedAt\`    datetime     NULL,
  \`createdAt\`           datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`lastActiveAt\`        datetime     NOT NULL,
  \`expiresAt\`           datetime     NOT NULL,
  \`revokedAt\`           datetime     NULL,
  \`revokedReason\`       varchar(30)  NULL,
  \`revokedNote\`         varchar(200) NULL,
  \`revokedById\`         varchar(36)  NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_user_sessions_user\` (\`userId\`, \`revokedAt\`),
  KEY \`idx_user_sessions_expires\` (\`expiresAt\`),
  KEY \`idx_user_sessions_last\` (\`lastActiveAt\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    await q.query(`CREATE TABLE IF NOT EXISTS \`backup_databases\` (
  \`id\`                varchar(36)   NOT NULL,
  \`name\`              varchar(120)  NOT NULL,
  \`description\`       varchar(500)  NULL,
  \`useAppCredentials\` tinyint       NOT NULL DEFAULT 0,
  \`host\`              varchar(255)  NULL,
  \`port\`              int           NULL,
  \`username\`          varchar(100)  NULL,
  \`passwordEnc\`       text          NULL,
  \`databaseName\`      varchar(64)   NOT NULL,
  \`excludeTables\`     text          NULL,
  \`isDefault\`         tinyint       NOT NULL DEFAULT 0,
  \`isActive\`          tinyint       NOT NULL DEFAULT 1,
  \`lastTestAt\`        datetime      NULL,
  \`lastTestOk\`        tinyint       NULL,
  \`lastTestError\`     varchar(1000) NULL,
  \`serverVersion\`     varchar(100)  NULL,
  \`lastBackupAt\`      datetime      NULL,
  \`lastBackupStatus\`  varchar(20)   NULL,
  \`createdById\`       varchar(36)   NULL,
  \`createdAt\`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\`         datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`idx_backup_databases_active\` (\`isActive\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    // Tables des sauvegardes (si le script sauvegardes_automatiques.sql n'a jamais été exécuté)
    await q.query(`CREATE TABLE IF NOT EXISTS \`backup_schedules\` (
  \`id\`             varchar(36)  NOT NULL,
  \`name\`           varchar(120) NOT NULL,
  \`times\`          text         NOT NULL COMMENT 'JSON ["02:00","14:00"] (heures locales)',
  \`days\`           text         NULL     COMMENT 'JSON [1..7] 1 = lundi ; NULL = tous les jours',
  \`timezone\`       varchar(60)  NOT NULL DEFAULT 'Africa/Lubumbashi',
  \`keepLast\`       int          NOT NULL DEFAULT 14,
  \`includeUploads\` tinyint      NOT NULL DEFAULT 0,
  \`isActive\`       tinyint      NOT NULL DEFAULT 1,
  \`databaseId\`     varchar(36)  NULL,
  \`lastSlot\`       varchar(20)  NULL,
  \`lastRunAt\`      datetime     NULL,
  \`lastStatus\`     varchar(20)  NULL,
  \`createdById\`    varchar(36)  NULL,
  \`createdAt\`      datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\`      datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    await q.query(`CREATE TABLE IF NOT EXISTS \`backup_runs\` (
  \`id\`               varchar(36)  NOT NULL,
  \`scheduleId\`       varchar(36)  NULL,
  \`trigger\`          varchar(20)  NOT NULL DEFAULT 'MANUAL',
  \`databaseId\`       varchar(36)  NULL,
  \`databaseLabel\`    varchar(200) NULL,
  \`status\`           varchar(20)  NOT NULL DEFAULT 'RUNNING',
  \`fileName\`         varchar(190) NULL,
  \`sizeBytes\`        bigint       NULL,
  \`uploadsFileName\`  varchar(190) NULL,
  \`uploadsSizeBytes\` bigint       NULL,
  \`durationMs\`       int          NULL,
  \`error\`            text         NULL,
  \`deleted\`          tinyint      NOT NULL DEFAULT 0,
  \`createdById\`      varchar(36)  NULL,
  \`startedAt\`        datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`finishedAt\`       datetime     NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_backup_runs_started\` (\`startedAt\`),
  KEY \`idx_backup_runs_schedule\` (\`scheduleId\`, \`status\`),
  KEY \`idx_backup_runs_database\` (\`databaseId\`, \`startedAt\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    const columns: [string, string, string][] = [
      ['backup_schedules', 'databaseId', 'varchar(36) NULL'],
      ['backup_runs', 'databaseId', 'varchar(36) NULL'],
      ['backup_runs', 'databaseLabel', 'varchar(200) NULL'],
      ['bo_media_vendors', 'photoUrl', 'varchar(500) NULL'],
    ];
    for (const [table, name, def] of columns) {
      if ((await q.hasTable(table)) && !(await q.hasColumn(table, name))) {
        await q.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${def}`);
      }
    }
    const runs = await q.getTable('backup_runs');
    if (runs && !runs.indices.some((i) => i.name === 'idx_backup_runs_database')) {
      await q.query('CREATE INDEX `idx_backup_runs_database` ON `backup_runs` (`databaseId`, `startedAt`)');
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `user_sessions`');
    await q.query('DROP TABLE IF EXISTS `backup_databases`');
  }
}
