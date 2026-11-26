import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Commission des courses en espèces (table driver_wallet_movements) + index rides.createdAt (tableau de bord).
 * Idempotente, aucune donnée existante modifiée. Script SQL équivalent : db/sql/courses_taxi_dashboard_commission_especes.sql
 */
export class DriverWalletMovements1794614400000 implements MigrationInterface {
  name = 'DriverWalletMovements1794614400000';

  private async exists(q: QueryRunner, sql: string): Promise<boolean> {
    const r = await q.query(sql);
    return r.length > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE IF NOT EXISTS `driver_wallet_movements` (' +
        '`id` varchar(36) NOT NULL,' +
        '`driverId` varchar(36) NOT NULL,' +
        '`currency` varchar(10) NOT NULL,' +
        '`type` varchar(30) NOT NULL,' +
        '`amount` decimal(14,2) NOT NULL,' +
        '`rideId` varchar(36) NULL DEFAULT NULL,' +
        '`description` varchar(255) NULL DEFAULT NULL,' +
        "`taxiCreditStatus` varchar(20) NOT NULL DEFAULT 'PENDING'," +
        '`taxiTransactionId` varchar(100) NULL DEFAULT NULL,' +
        '`taxiReference` varchar(100) NULL DEFAULT NULL,' +
        '`taxiCreditError` varchar(500) NULL DEFAULT NULL,' +
        '`taxiCreditAttempts` int NOT NULL DEFAULT 0,' +
        '`taxiCreditedAt` datetime(6) NULL DEFAULT NULL,' +
        '`createdById` varchar(36) NULL DEFAULT NULL,' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),' +
        '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),' +
        'PRIMARY KEY (`id`),' +
        'UNIQUE KEY `uq_driver_wallet_movement_ride_type` (`rideId`, `type`),' +
        'KEY `idx_driver_wallet_movement_driver` (`driverId`, `currency`),' +
        'KEY `idx_driver_wallet_movement_credit` (`taxiCreditStatus`)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    );

    const hasIndex = await this.exists(
      q,
      "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'createdAt' AND SEQ_IN_INDEX = 1 LIMIT 1",
    );
    if (!hasIndex) await q.query('ALTER TABLE `rides` ADD INDEX `idx_rides_created_at` (`createdAt`)');
  }

  public async down(q: QueryRunner): Promise<void> {
    const hasIndex = await this.exists(
      q,
      "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_created_at' LIMIT 1",
    );
    if (hasIndex) await q.query('ALTER TABLE `rides` DROP INDEX `idx_rides_created_at`');
    // ⚠️ Supprime l'historique des commissions espèces débitées
    await q.query('DROP TABLE IF EXISTS `driver_wallet_movements`');
  }
}
