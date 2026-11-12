import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retrait des gains des chauffeurs via F-Pay (route taxi/driver/cashout) : table driver_cashouts. Idempotente.
 * Script SQL équivalent : db/sql/retraits_chauffeurs_fpay.sql
 */
export class DriverCashouts1794009600000 implements MigrationInterface {
  name = 'DriverCashouts1794009600000';

  private async userCol(q: QueryRunner): Promise<string> {
    const r = await q.query(
      "SELECT COLUMN_TYPE AS t, CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1",
    );
    const c = r?.[0] ?? {};
    return `${c.t || 'varchar(36)'}${c.cs ? ` CHARACTER SET ${c.cs} COLLATE ${c.coll}` : ''}`;
  }

  public async up(q: QueryRunner): Promise<void> {
    const tbl = await q.query("SELECT TABLE_COLLATION AS coll FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' LIMIT 1");
    const coll = tbl?.[0]?.coll || 'utf8mb4_unicode_ci';
    const cs = String(coll).split('_')[0] || 'utf8mb4';
    const userCol = await this.userCol(q);

    if (!(await q.hasTable('driver_cashouts'))) {
      await q.query(
        'CREATE TABLE `driver_cashouts` (' +
          '`id` varchar(36) NOT NULL, `reference` varchar(40) NOT NULL, ' +
          `\`driverId\` ${userCol} NOT NULL, ` +
          '`requestId` varchar(80) NULL DEFAULT NULL, `amount` decimal(14,2) NOT NULL, `currency` varchar(10) NOT NULL, ' +
          '`balanceBefore` decimal(14,2) NULL DEFAULT NULL, `paymentMethodId` varchar(36) NULL DEFAULT NULL, ' +
          '`provider` varchar(60) NOT NULL, `phone` varchar(30) NOT NULL, `walletId` varchar(64) NULL DEFAULT NULL, ' +
          "`status` varchar(20) NOT NULL DEFAULT 'PROCESSING', " +
          '`fpayTransactionId` varchar(100) NULL DEFAULT NULL, `fpayReference` varchar(100) NULL DEFAULT NULL, ' +
          '`fpayExternalReference` varchar(100) NULL DEFAULT NULL, `fpayStatus` varchar(30) NULL DEFAULT NULL, ' +
          '`fpayCurrency` varchar(10) NULL DEFAULT NULL, `fpayMessage` varchar(500) NULL DEFAULT NULL, `fpayResponse` json NULL, ' +
          '`failureReason` varchar(500) NULL DEFAULT NULL, `completedAt` datetime(6) NULL DEFAULT NULL, ' +
          '`resolvedById` varchar(36) NULL DEFAULT NULL, `resolutionNote` varchar(500) NULL DEFAULT NULL, ' +
          '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          'PRIMARY KEY (`id`), UNIQUE KEY `uq_driver_cashout_reference` (`reference`), ' +
          'UNIQUE KEY `uq_driver_cashout_request` (`driverId`, `requestId`), ' +
          'KEY `idx_driver_cashout_driver` (`driverId`, `createdAt`), KEY `idx_driver_cashout_status` (`status`, `createdAt`)' +
          `) ENGINE=InnoDB DEFAULT CHARSET=${cs} COLLATE=${coll}`,
      );
    }
    const fk = await q.query(
      "SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_cashouts' AND CONSTRAINT_NAME = 'fk_driver_cashout_driver'",
    );
    if (!Number(fk?.[0]?.n)) {
      await q.query(
        'ALTER TABLE `driver_cashouts` ADD CONSTRAINT `fk_driver_cashout_driver` FOREIGN KEY (`driverId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
      );
    }
    if (await q.hasTable('rides')) {
      const idx = await q.query(
        "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_driver_earnings'",
      );
      if (!Number(idx?.[0]?.n)) await q.query('CREATE INDEX `idx_rides_driver_earnings` ON `rides` (`driverId`, `status`, `paymentStatus`)');
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasTable('rides')) {
      const idx = await q.query(
        "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_driver_earnings'",
      );
      if (Number(idx?.[0]?.n)) await q.query('DROP INDEX `idx_rides_driver_earnings` ON `rides`');
    }
    if (await q.hasTable('driver_cashouts')) await q.query('DROP TABLE `driver_cashouts`');
  }
}
