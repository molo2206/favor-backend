import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chat chauffeur ↔ client : réponse à un message (replyToId) + « supprimer pour moi » (hiddenFor). Idempotente.
 * Script SQL équivalent : db/sql/chat_reponse_suppression_pour_moi.sql
 */
export class RideChatReplyHidden1793923200000 implements MigrationInterface {
  name = 'RideChatReplyHidden1793923200000';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('ride_chat_messages'))) return;
    if (!(await q.hasColumn('ride_chat_messages', 'replyToId'))) {
      await q.query('ALTER TABLE `ride_chat_messages` ADD COLUMN `replyToId` varchar(36) NULL DEFAULT NULL AFTER `audioSize`');
    }
    if (!(await q.hasColumn('ride_chat_messages', 'hiddenFor'))) {
      await q.query('ALTER TABLE `ride_chat_messages` ADD COLUMN `hiddenFor` text NULL AFTER `replyToId`');
    }
    const idx = await q.query(
      "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_chat_messages' AND INDEX_NAME = 'idx_ride_chat_reply'",
    );
    if (!Number(idx?.[0]?.n)) await q.query('CREATE INDEX `idx_ride_chat_reply` ON `ride_chat_messages` (`replyToId`)');
    const fk = await q.query(
      "SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_chat_messages' AND CONSTRAINT_NAME = 'fk_ride_chat_reply'",
    );
    if (!Number(fk?.[0]?.n)) {
      await q.query(
        'ALTER TABLE `ride_chat_messages` ADD CONSTRAINT `fk_ride_chat_reply` FOREIGN KEY (`replyToId`) REFERENCES `ride_chat_messages` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('ride_chat_messages'))) return;
    const fk = await q.query(
      "SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_chat_messages' AND CONSTRAINT_NAME = 'fk_ride_chat_reply'",
    );
    if (Number(fk?.[0]?.n)) await q.query('ALTER TABLE `ride_chat_messages` DROP FOREIGN KEY `fk_ride_chat_reply`');
    if (await q.hasColumn('ride_chat_messages', 'hiddenFor')) await q.query('ALTER TABLE `ride_chat_messages` DROP COLUMN `hiddenFor`');
    if (await q.hasColumn('ride_chat_messages', 'replyToId')) await q.query('ALTER TABLE `ride_chat_messages` DROP COLUMN `replyToId`');
  }
}
