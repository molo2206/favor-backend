import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Chat de course : signalement + blocage (exigence Apple 1.2).
 *    Script SQL équivalent : db/sql/chat_signalement_blocage.sql
 */
export class RideChatSafety1795132800000 implements MigrationInterface {
  name = 'RideChatSafety1795132800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS \`ride_chat_reports\` (
  \`id\`              varchar(36)   NOT NULL,
  \`rideId\`          varchar(36)   NOT NULL,
  \`messageId\`       varchar(36)   NULL,
  \`reporterId\`      varchar(36)   NOT NULL,
  \`reporterRole\`    varchar(10)   NOT NULL,
  \`reportedUserId\`  varchar(36)   NOT NULL,
  \`reason\`          varchar(20)   NOT NULL,
  \`details\`         text          NULL,
  \`messageSnapshot\` json          NULL,
  \`alsoBlocked\`     tinyint       NOT NULL DEFAULT 0,
  \`status\`          varchar(20)   NOT NULL DEFAULT 'PENDING',
  \`adminNote\`       varchar(1000) NULL,
  \`reviewedById\`    varchar(36)   NULL,
  \`reviewedAt\`      datetime(6)   NULL,
  \`createdAt\`       datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\`       datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`idx_rcr_status_created\` (\`status\`, \`createdAt\`),
  KEY \`idx_rcr_reported\` (\`reportedUserId\`),
  KEY \`idx_rcr_ride\` (\`rideId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE IF NOT EXISTS \`ride_chat_blocks\` (
  \`id\`        varchar(36)  NOT NULL,
  \`blockerId\` varchar(36)  NOT NULL,
  \`blockedId\` varchar(36)  NOT NULL,
  \`rideId\`    varchar(36)  NULL,
  \`reason\`    varchar(500) NULL,
  \`createdAt\` datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_rcb_pair\` (\`blockerId\`, \`blockedId\`),
  KEY \`idx_rcb_blocked\` (\`blockedId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `ride_chat_blocks`');
    await q.query('DROP TABLE IF EXISTS `ride_chat_reports`');
  }
}
