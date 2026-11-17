import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chat chauffeur ↔ client (texte + vocal) : table ride_chat_messages. Idempotente.
 * Script SQL équivalent : db/sql/chat_chauffeur_client.sql
 */
export class RideChatMessages1793664000000 implements MigrationInterface {
  name = 'RideChatMessages1793664000000';

  private async colType(q: QueryRunner, table: string): Promise<string> {
    const r = await q.query(
      `SELECT COLUMN_TYPE AS t, CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = 'id' LIMIT 1`,
    );
    const c = r?.[0] ?? {};
    return `${c.t || 'varchar(36)'}${c.cs ? ` CHARACTER SET ${c.cs} COLLATE ${c.coll}` : ''}`;
  }

  private async fk(q: QueryRunner, table: string, name: string, sql: string) {
    const r = await q.query(
      `SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND CONSTRAINT_NAME = '${name}'`,
    );
    if (!Number(r?.[0]?.n)) await q.query(sql);
  }

  public async up(q: QueryRunner): Promise<void> {
    const tbl = await q.query("SELECT TABLE_COLLATION AS coll FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' LIMIT 1");
    const coll = tbl?.[0]?.coll || 'utf8mb4_unicode_ci';
    const cs = String(coll).split('_')[0] || 'utf8mb4';
    const userCol = await this.colType(q, 'users');
    const rideCol = await this.colType(q, 'rides');

    if (!(await q.hasTable('ride_chat_messages'))) {
      await q.query(
        'CREATE TABLE `ride_chat_messages` (' +
          '`id` varchar(36) NOT NULL, ' +
          `\`rideId\` ${rideCol} NOT NULL, ` +
          `\`senderId\` ${userCol} NOT NULL, ` +
          "`senderRole` enum('RIDER','DRIVER') NOT NULL, " +
          '`recipientId` varchar(36) NULL DEFAULT NULL, ' +
          "`type` enum('TEXT','AUDIO') NOT NULL DEFAULT 'TEXT', " +
          '`text` text NULL, `audioUrl` varchar(500) NULL DEFAULT NULL, `audioDuration` int NULL DEFAULT NULL, ' +
          '`audioMimeType` varchar(100) NULL DEFAULT NULL, `audioSize` int NULL DEFAULT NULL, ' +
          '`clientMessageId` varchar(64) NULL DEFAULT NULL, ' +
          '`deliveredAt` datetime(6) NULL DEFAULT NULL, `readAt` datetime(6) NULL DEFAULT NULL, ' +
          '`isDeleted` tinyint NOT NULL DEFAULT 0, `deletedAt` datetime(6) NULL DEFAULT NULL, ' +
          '`deletedById` varchar(36) NULL DEFAULT NULL, `deletedBy` varchar(10) NULL DEFAULT NULL, ' +
          '`deletedReason` varchar(500) NULL DEFAULT NULL, ' +
          '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          'PRIMARY KEY (`id`), ' +
          'UNIQUE KEY `uq_ride_chat_client_msg` (`rideId`, `senderId`, `clientMessageId`), ' +
          'KEY `idx_ride_chat_ride_created` (`rideId`, `createdAt`), ' +
          'KEY `idx_ride_chat_sender` (`senderId`), ' +
          'KEY `idx_ride_chat_recipient_read` (`recipientId`, `readAt`)' +
          `) ENGINE=InnoDB DEFAULT CHARSET=${cs} COLLATE=${coll}`,
      );
    }

    await this.fk(
      q,
      'ride_chat_messages',
      'fk_ride_chat_ride',
      'ALTER TABLE `ride_chat_messages` ADD CONSTRAINT `fk_ride_chat_ride` FOREIGN KEY (`rideId`) REFERENCES `rides` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await this.fk(
      q,
      'ride_chat_messages',
      'fk_ride_chat_sender',
      'ALTER TABLE `ride_chat_messages` ADD CONSTRAINT `fk_ride_chat_sender` FOREIGN KEY (`senderId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasTable('ride_chat_messages')) await q.query('DROP TABLE `ride_chat_messages`');
  }
}
