import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Sauvegardes automatiques programmables : tables backup_schedules et backup_runs
 *    + programmation par défaut (tous les jours à 02:00). Script SQL équivalent : db/sql/sauvegardes_automatiques.sql
 */
export class BackupSchedules1794960000000 implements MigrationInterface {
  name = 'BackupSchedules1794960000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS \`backup_schedules\` (
  \`id\`             varchar(36)  NOT NULL,
  \`name\`           varchar(120) NOT NULL,
  \`times\`          text         NOT NULL COMMENT 'JSON ["02:00","14:00"] (heures locales)',
  \`days\`           text         NULL     COMMENT 'JSON [1..7] 1 = lundi `);
    await q.query(`CREATE TABLE IF NOT EXISTS \`backup_runs\` (
  \`id\`               varchar(36)  NOT NULL,
  \`scheduleId\`       varchar(36)  NULL,
  \`trigger\`          varchar(20)  NOT NULL DEFAULT 'MANUAL',
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
  KEY \`idx_backup_runs_schedule\` (\`scheduleId\`, \`status\`)
) ENGINE=InnoDB`);
    await q.query(`INSERT INTO \`backup_schedules\` (\`id\`, \`name\`, \`times\`, \`days\`, \`timezone\`, \`keepLast\`, \`includeUploads\`, \`isActive\`)
SELECT UUID(), 'Sauvegarde quotidienne', '["02:00"]', NULL, 'Africa/Lubumbashi', 14, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM \`backup_schedules\`)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `backup_runs`');
    await q.query('DROP TABLE IF EXISTS `backup_schedules`');
  }
}
