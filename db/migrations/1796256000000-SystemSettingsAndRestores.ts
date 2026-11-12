import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Paramètres système (system_settings, system_setting_history) + restaurations de bases (backup_restores).
 *    Script SQL équivalent : db/sql/parametres_systeme_et_restauration.sql
 */
export class SystemSettingsAndRestores1796256000000 implements MigrationInterface {
  name = 'SystemSettingsAndRestores1796256000000';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('system_settings'))) {
      await q.query(`CREATE TABLE \`system_settings\` (
  \`settingKey\`    varchar(100) NOT NULL,
  \`value\`         mediumtext   NULL,
  \`isSecret\`      tinyint      NOT NULL DEFAULT 0,
  \`isActive\`      tinyint      NOT NULL DEFAULT 1,
  \`category\`      varchar(40)  NOT NULL DEFAULT 'other',
  \`description\`   varchar(500) NULL,
  \`updatedById\`   varchar(36)  NULL,
  \`updatedByName\` varchar(150) NULL,
  \`createdAt\`     datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\`     datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`settingKey\`),
  KEY \`idx_system_settings_category\` (\`category\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await q.hasTable('system_setting_history'))) {
      await q.query(`CREATE TABLE \`system_setting_history\` (
  \`id\`            varchar(36)  NOT NULL,
  \`settingKey\`    varchar(100) NOT NULL,
  \`action\`        varchar(20)  NOT NULL,
  \`oldValue\`      mediumtext   NULL,
  \`newValue\`      mediumtext   NULL,
  \`isSecret\`      tinyint      NOT NULL DEFAULT 0,
  \`note\`          varchar(300) NULL,
  \`changedById\`   varchar(36)  NULL,
  \`changedByName\` varchar(150) NULL,
  \`createdAt\`     datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`idx_system_setting_history_key\` (\`settingKey\`, \`createdAt\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await q.hasTable('backup_restores'))) {
      await q.query(`CREATE TABLE \`backup_restores\` (
  \`id\`                 varchar(36)  NOT NULL,
  \`kind\`               varchar(20)  NOT NULL DEFAULT 'DATABASE',
  \`sourceType\`         varchar(20)  NOT NULL DEFAULT 'FILE',
  \`fileName\`           varchar(190) NULL,
  \`sourceDatabaseId\`   varchar(36)  NULL,
  \`sourceLabel\`        varchar(200) NULL,
  \`targetDatabaseId\`   varchar(36)  NULL,
  \`targetLabel\`        varchar(200) NULL,
  \`targetDatabaseName\` varchar(64)  NULL,
  \`createdDatabase\`    tinyint      NOT NULL DEFAULT 0,
  \`status\`             varchar(20)  NOT NULL DEFAULT 'RUNNING',
  \`phase\`              varchar(30)  NOT NULL DEFAULT 'PREPARING',
  \`progress\`           int          NOT NULL DEFAULT 0,
  \`bytesTotal\`         bigint       NULL,
  \`bytesDone\`          bigint       NULL,
  \`safetyBackupFile\`   varchar(190) NULL,
  \`error\`              text         NULL,
  \`durationMs\`         int          NULL,
  \`createdById\`        varchar(36)  NULL,
  \`createdByName\`      varchar(150) NULL,
  \`startedAt\`          datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`finishedAt\`         datetime     NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_backup_restores_started\` (\`startedAt\`),
  KEY \`idx_backup_restores_target\` (\`targetDatabaseId\`, \`startedAt\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `backup_restores`');
    await q.query('DROP TABLE IF EXISTS `system_setting_history`');
    await q.query('DROP TABLE IF EXISTS `system_settings`');
  }
}
