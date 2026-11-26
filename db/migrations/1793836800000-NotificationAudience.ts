import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Logique d'envoi des notifications : user_settings.marketing_notifications + last_marketing_push_at. Idempotente.
 * Script SQL équivalent : db/sql/notifications_logique_envoi.sql
 */
export class NotificationAudience1793836800000 implements MigrationInterface {
  name = 'NotificationAudience1793836800000';

  private async index(q: QueryRunner, table: string, name: string, sql: string) {
    const r = await q.query(
      `SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND INDEX_NAME = '${name}'`,
    );
    if (!Number(r?.[0]?.n)) await q.query(sql);
  }

  public async up(q: QueryRunner): Promise<void> {
    if (await q.hasTable('user_settings')) {
      if (!(await q.hasColumn('user_settings', 'marketing_notifications'))) {
        await q.query('ALTER TABLE `user_settings` ADD COLUMN `marketing_notifications` tinyint NOT NULL DEFAULT 1');
      }
      if (!(await q.hasColumn('user_settings', 'last_marketing_push_at'))) {
        await q.query('ALTER TABLE `user_settings` ADD COLUMN `last_marketing_push_at` datetime NULL DEFAULT NULL');
      }
      await this.index(
        q,
        'user_settings',
        'idx_user_settings_marketing',
        'CREATE INDEX `idx_user_settings_marketing` ON `user_settings` (`marketing_notifications`, `last_marketing_push_at`)',
      );
    }
    if (await q.hasTable('device_tokens')) {
      await this.index(q, 'device_tokens', 'idx_device_tokens_user_platform', 'CREATE INDEX `idx_device_tokens_user_platform` ON `device_tokens` (`userId`, `platform`)');
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasTable('user_settings')) {
      if (await q.hasColumn('user_settings', 'last_marketing_push_at')) await q.query('ALTER TABLE `user_settings` DROP COLUMN `last_marketing_push_at`');
      if (await q.hasColumn('user_settings', 'marketing_notifications')) await q.query('ALTER TABLE `user_settings` DROP COLUMN `marketing_notifications`');
    }
  }
}
