import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Canaux de notification par application (x-platform : mobile, web, admin, group).
 * user_notifications.channels = "mobile,web" ; NULL = toutes les applications. Idempotente.
 * Script SQL équivalent : db/sql/notifications_canaux_plateforme.sql
 */
export class NotificationChannels1793232000000 implements MigrationInterface {
  name = 'NotificationChannels1793232000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('user_notifications', 'channels'))) {
      await queryRunner.query('ALTER TABLE `user_notifications` ADD COLUMN `channels` varchar(60) NULL DEFAULT NULL');
    }
    if (await queryRunner.hasColumn('device_tokens', 'platform')) {
      await queryRunner.query('UPDATE `device_tokens` SET `platform` = LOWER(TRIM(`platform`)) WHERE `platform` IS NOT NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('user_notifications', 'channels')) {
      await queryRunner.query('ALTER TABLE `user_notifications` DROP COLUMN `channels`');
    }
  }
}
