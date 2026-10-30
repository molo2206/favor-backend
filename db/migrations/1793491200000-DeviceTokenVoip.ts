import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Appels même application fermée : device_tokens.voipToken (jeton VoIP iPhone / CallKit). Idempotente.
 * Script SQL équivalent : db/sql/appels_voip_device_tokens.sql
 */
export class DeviceTokenVoip1793491200000 implements MigrationInterface {
  name = 'DeviceTokenVoip1793491200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('device_tokens', 'voipToken'))) {
      await queryRunner.query('ALTER TABLE `device_tokens` ADD COLUMN `voipToken` varchar(255) NULL DEFAULT NULL');
    }
    const idx = await queryRunner.query(
      "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'device_tokens' AND INDEX_NAME = 'idx_device_tokens_voip'",
    );
    if (!Number(idx?.[0]?.n)) await queryRunner.query('CREATE INDEX `idx_device_tokens_voip` ON `device_tokens` (`voipToken`)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const idx = await queryRunner.query(
      "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'device_tokens' AND INDEX_NAME = 'idx_device_tokens_voip'",
    );
    if (Number(idx?.[0]?.n)) await queryRunner.query('DROP INDEX `idx_device_tokens_voip` ON `device_tokens`');
    if (await queryRunner.hasColumn('device_tokens', 'voipToken')) await queryRunner.query('ALTER TABLE `device_tokens` DROP COLUMN `voipToken`');
  }
}
