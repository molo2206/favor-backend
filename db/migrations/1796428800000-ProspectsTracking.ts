import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Prospects : pays, ville, réseau social, langues, suivi des agents, doublons, historique.
 *    Script SQL équivalent : db/sql/prospects_suivi_agents.sql
 */
export class ProspectsTracking1796428800000 implements MigrationInterface {
  name = 'ProspectsTracking1796428800000';

  public async up(q: QueryRunner): Promise<void> {
    const cols: [string, string][] = [
      ['socialNetwork', 'varchar(20) NULL'],
      ['socialNetworkOther', 'varchar(100) NULL'],
      ['countryId', 'varchar(36) NULL'],
      ['countryName', 'varchar(120) NULL'],
      ['cityId', 'varchar(36) NULL'],
      ['cityName', 'varchar(120) NULL'],
      ['languages', 'json NULL'],
      ['createdById', 'varchar(36) NULL'],
      ['assignedById', 'varchar(36) NULL'],
      ['assignedAt', 'datetime NULL'],
      ['processedAt', 'datetime NULL'],
      ['convertedAt', 'datetime NULL'],
      ['lostAt', 'datetime NULL'],
      ['lostReason', 'varchar(500) NULL'],
      ['statusChangedAt', 'datetime NULL'],
      ['linkedUserId', 'varchar(36) NULL'],
      ['linkedAt', 'datetime NULL'],
    ];
    for (const [name, def] of cols) {
      if (!(await q.hasColumn('prospects', name))) await q.query(`ALTER TABLE \`prospects\` ADD COLUMN \`${name}\` ${def}`);
    }
    for (const [name, def] of [
      ['idx_prospects_country', '(`countryId`)'],
      ['idx_prospects_city', '(`cityId`)'],
      ['idx_prospects_created_by', '(`createdById`)'],
      ['idx_prospects_linked_user', '(`linkedUserId`)'],
      ['idx_prospects_status_created', '(`status`, `createdAt`)'],
    ]) {
      await q.query(`ALTER TABLE \`prospects\` ADD INDEX \`${name}\` ${def}`).catch(() => undefined);
    }
    if (!(await q.hasTable('prospect_assignments'))) {
      await q.query(`CREATE TABLE \`prospect_assignments\` (
        \`id\` varchar(36) NOT NULL, \`prospectId\` varchar(36) NOT NULL, \`prospectName\` varchar(255) NULL,
        \`type\` varchar(20) NOT NULL, \`fromUserId\` varchar(36) NULL, \`fromUserName\` varchar(150) NULL,
        \`toUserId\` varchar(36) NULL, \`toUserName\` varchar(150) NULL, \`assignedById\` varchar(36) NULL,
        \`assignedByName\` varchar(150) NULL, \`statusAtAssignment\` varchar(30) NULL, \`note\` varchar(500) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_prospect_assign_prospect\` (\`prospectId\`, \`createdAt\`),
        KEY \`idx_prospect_assign_by\` (\`assignedById\`, \`createdAt\`),
        KEY \`idx_prospect_assign_to\` (\`toUserId\`, \`createdAt\`),
        KEY \`idx_prospect_assign_from\` (\`fromUserId\`, \`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await q.hasTable('prospect_history'))) {
      await q.query(`CREATE TABLE \`prospect_history\` (
        \`id\` varchar(36) NOT NULL, \`prospectId\` varchar(36) NOT NULL, \`prospectName\` varchar(255) NULL,
        \`action\` varchar(30) NOT NULL, \`userId\` varchar(36) NULL, \`userName\` varchar(150) NULL,
        \`oldStatus\` varchar(30) NULL, \`newStatus\` varchar(30) NULL, \`changes\` json NULL, \`note\` varchar(500) NULL,
        \`metadata\` json NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_prospect_history_prospect\` (\`prospectId\`, \`createdAt\`),
        KEY \`idx_prospect_history_user\` (\`userId\`, \`createdAt\`),
        KEY \`idx_prospect_history_action\` (\`action\`, \`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `prospect_history`');
    await q.query('DROP TABLE IF EXISTS `prospect_assignments`');
  }
}
