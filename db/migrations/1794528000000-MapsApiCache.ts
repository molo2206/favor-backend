import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cache Google Maps en base : table maps_api_cache + index addresses.place_id.
 * Idempotente, aucune donnée existante modifiée. Script SQL équivalent : db/sql/cache_google_maps.sql
 */
export class MapsApiCache1794528000000 implements MigrationInterface {
  name = 'MapsApiCache1794528000000';

  private async exists(q: QueryRunner, sql: string, params: any[]): Promise<boolean> {
    const r = await q.query(sql, params);
    return r.length > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE IF NOT EXISTS `maps_api_cache` (' +
        '`id` varchar(36) NOT NULL,' +
        '`kind` varchar(40) NOT NULL,' +
        '`key_hash` char(64) NOT NULL,' +
        '`request` text NOT NULL,' +
        "`status` varchar(30) NOT NULL DEFAULT 'OK'," +
        '`response` json NOT NULL,' +
        '`hit_count` int NOT NULL DEFAULT 0,' +
        '`google_calls` int NOT NULL DEFAULT 1,' +
        '`expires_at` datetime NOT NULL,' +
        '`last_hit_at` datetime NULL DEFAULT NULL,' +
        '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
        '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),' +
        'PRIMARY KEY (`id`),' +
        'UNIQUE KEY `uq_maps_api_cache_key_hash` (`key_hash`),' +
        'KEY `idx_maps_api_cache_kind_expires` (`kind`, `expires_at`)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    );

    const hasIndex = await this.exists(
      q,
      "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'addresses' AND COLUMN_NAME = 'place_id' AND SEQ_IN_INDEX = 1 LIMIT 1",
      [],
    );
    if (!hasIndex) {
      await q.query('ALTER TABLE `addresses` ADD INDEX `idx_addresses_place_id` (`place_id`)');
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    const hasIndex = await this.exists(
      q,
      "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'addresses' AND INDEX_NAME = 'idx_addresses_place_id' LIMIT 1",
      [],
    );
    if (hasIndex) await q.query('ALTER TABLE `addresses` DROP INDEX `idx_addresses_place_id`');
    await q.query('DROP TABLE IF EXISTS `maps_api_cache`');
  }
}
