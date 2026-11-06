import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Horaires et programmes de travail des utilisateurs (3 tables + ressource WORK_SCHEDULES).
 *    Script SQL équivalent : db/sql/horaires_travail_utilisateurs.sql
 */
export class WorkSchedules1795910400000 implements MigrationInterface {
  name = 'WorkSchedules1795910400000';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('work_schedules'))) {
      await q.query(`CREATE TABLE \`work_schedules\` (
        \`id\` varchar(36) NOT NULL,
        \`companyId\` varchar(36) NOT NULL,
        \`userId\` varchar(36) NULL,
        \`scopeKey\` varchar(36) NOT NULL,
        \`name\` varchar(120) NOT NULL,
        \`timezone\` varchar(64) NULL,
        \`isActive\` tinyint NOT NULL DEFAULT 1,
        \`graceMinutes\` int NOT NULL DEFAULT 0,
        \`applyToOwners\` tinyint NOT NULL DEFAULT 0,
        \`isLocked\` tinyint NOT NULL DEFAULT 0,
        \`validFrom\` date NULL,
        \`validUntil\` date NULL,
        \`notes\` varchar(500) NULL,
        \`createdById\` varchar(36) NULL,
        \`updatedById\` varchar(36) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_work_schedule_scope\` (\`companyId\`, \`scopeKey\`),
        KEY \`idx_work_schedule_user\` (\`userId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await q.hasTable('work_schedule_slots'))) {
      await q.query(`CREATE TABLE \`work_schedule_slots\` (
        \`id\` varchar(36) NOT NULL,
        \`scheduleId\` varchar(36) NOT NULL,
        \`dayOfWeek\` tinyint NOT NULL,
        \`startTime\` char(5) NOT NULL,
        \`endTime\` char(5) NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_work_schedule_slot_schedule\` (\`scheduleId\`, \`dayOfWeek\`),
        CONSTRAINT \`fk_work_schedule_slot_schedule\` FOREIGN KEY (\`scheduleId\`) REFERENCES \`work_schedules\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await q.hasTable('work_schedule_exceptions'))) {
      await q.query(`CREATE TABLE \`work_schedule_exceptions\` (
        \`id\` varchar(36) NOT NULL,
        \`companyId\` varchar(36) NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`startsAt\` datetime(6) NOT NULL,
        \`endsAt\` datetime(6) NOT NULL,
        \`reason\` varchar(500) NOT NULL,
        \`createdById\` varchar(36) NULL,
        \`revokedAt\` datetime(6) NULL,
        \`revokedById\` varchar(36) NULL,
        \`revokeReason\` varchar(500) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_work_schedule_exc_user\` (\`userId\`, \`companyId\`, \`endsAt\`),
        KEY \`idx_work_schedule_exc_company\` (\`companyId\`, \`startsAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (await q.hasTable('resources')) {
      await q.query(
        "INSERT INTO `resources` (`id`, `name`, `label`, `description`, `status`, `deleted`, `createdAt`, `updatedAt`) " +
          "SELECT UUID(), 'WORK_SCHEDULES', 'Horaires de travail', 'Programmes de travail des utilisateurs et dérogations', 1, 0, NOW(6), NOW(6) " +
          "FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `resources` WHERE `name` = 'WORK_SCHEDULES')",
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `work_schedule_slots`');
    await q.query('DROP TABLE IF EXISTS `work_schedule_exceptions`');
    await q.query('DROP TABLE IF EXISTS `work_schedules`');
  }
}
