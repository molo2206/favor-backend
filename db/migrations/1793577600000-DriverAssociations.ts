import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chauffeurs PRIVÉS ou MEMBRES d'une association : driver_associations, driver_profiles,
 * et rides.associationId / associationCommissionRate / associationCommissionAmount. Idempotente.
 * Script SQL équivalent : db/sql/chauffeurs_associations.sql
 */
export class DriverAssociations1793577600000 implements MigrationInterface {
  name = 'DriverAssociations1793577600000';

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
    const cityCol = await this.colType(q, 'cities');

    if (!(await q.hasTable('driver_associations'))) {
      await q.query(
        'CREATE TABLE `driver_associations` (' +
          '`id` varchar(36) NOT NULL, `name` varchar(150) NOT NULL, `code` varchar(30) NULL DEFAULT NULL, ' +
          `\`cityId\` ${cityCol} NULL DEFAULT NULL, ` +
          '`managerName` varchar(150) NULL DEFAULT NULL, `phone` varchar(30) NULL DEFAULT NULL, `email` varchar(150) NULL DEFAULT NULL, ' +
          '`address` varchar(255) NULL DEFAULT NULL, `logoUrl` varchar(500) NULL DEFAULT NULL, `description` text NULL, ' +
          '`commissionRate` decimal(5,2) NOT NULL DEFAULT 0, `isActive` tinyint NOT NULL DEFAULT 1, ' +
          '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          'PRIMARY KEY (`id`), UNIQUE KEY `uq_driver_assoc_name` (`name`), UNIQUE KEY `uq_driver_assoc_code` (`code`), ' +
          'KEY `idx_driver_assoc_city` (`cityId`, `isActive`)' +
          `) ENGINE=InnoDB DEFAULT CHARSET=${cs} COLLATE=${coll}`,
      );
    }
    if (!(await q.hasTable('driver_profiles'))) {
      await q.query(
        'CREATE TABLE `driver_profiles` (' +
          '`id` varchar(36) NOT NULL, ' +
          `\`driverId\` ${userCol} NOT NULL, ` +
          "`type` enum('PRIVATE','ASSOCIATION') NOT NULL DEFAULT 'PRIVATE', " +
          '`associationId` varchar(36) NULL DEFAULT NULL, `memberNumber` varchar(50) NULL DEFAULT NULL, ' +
          '`joinedAt` datetime(6) NULL DEFAULT NULL, `note` varchar(500) NULL DEFAULT NULL, `updatedById` varchar(36) NULL DEFAULT NULL, ' +
          '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          'PRIMARY KEY (`id`), UNIQUE KEY `uq_driver_profile_driver` (`driverId`), KEY `idx_driver_profile_assoc` (`associationId`)' +
          `) ENGINE=InnoDB DEFAULT CHARSET=${cs} COLLATE=${coll}`,
      );
    }

    if (await q.hasTable('cities')) {
      await this.fk(q, 'driver_associations', 'fk_driver_assoc_city',
        'ALTER TABLE `driver_associations` ADD CONSTRAINT `fk_driver_assoc_city` FOREIGN KEY (`cityId`) REFERENCES `cities` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION');
    }
    await this.fk(q, 'driver_profiles', 'fk_driver_profile_driver',
      'ALTER TABLE `driver_profiles` ADD CONSTRAINT `fk_driver_profile_driver` FOREIGN KEY (`driverId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION');
    await this.fk(q, 'driver_profiles', 'fk_driver_profile_assoc',
      'ALTER TABLE `driver_profiles` ADD CONSTRAINT `fk_driver_profile_assoc` FOREIGN KEY (`associationId`) REFERENCES `driver_associations` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION');

    const cols: [string, string][] = [
      ['associationId', 'varchar(36) NULL DEFAULT NULL'],
      ['associationCommissionRate', 'decimal(5,2) NULL DEFAULT NULL'],
      ['associationCommissionAmount', 'decimal(10,2) NULL DEFAULT NULL'],
    ];
    for (const [c, d] of cols) {
      if (!(await q.hasColumn('rides', c))) await q.query(`ALTER TABLE \`rides\` ADD COLUMN \`${c}\` ${d}`);
    }
    const idx = await q.query("SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_association'");
    if (!Number(idx?.[0]?.n)) await q.query('CREATE INDEX `idx_rides_association` ON `rides` (`associationId`, `completedAt`)');
  }

  public async down(q: QueryRunner): Promise<void> {
    const idx = await q.query("SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_association'");
    if (Number(idx?.[0]?.n)) await q.query('DROP INDEX `idx_rides_association` ON `rides`');
    for (const c of ['associationCommissionAmount', 'associationCommissionRate', 'associationId']) {
      if (await q.hasColumn('rides', c)) await q.query(`ALTER TABLE \`rides\` DROP COLUMN \`${c}\``);
    }
    if (await q.hasTable('driver_profiles')) await q.query('DROP TABLE `driver_profiles`');
    if (await q.hasTable('driver_associations')) await q.query('DROP TABLE `driver_associations`');
  }
}
