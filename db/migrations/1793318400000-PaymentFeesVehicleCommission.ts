import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Paiements : commission par véhicule (driver_vehicles.commissionRate), paiement des courses (rides)
 * et frais de transaction des annonces (classified_payments) — frais et devise envoyés par le front.
 * Idempotente.
 * Script SQL équivalent : db/sql/paiements_frais_commission_vehicule.sql
 */
const COLUMNS: [string, string, string][] = [
  ['driver_vehicles', 'commissionRate', 'decimal(5,2) NULL DEFAULT NULL'],
  ['rides', 'commissionRate', 'decimal(5,2) NULL DEFAULT NULL'],
  ['rides', 'transactionFee', 'decimal(10,2) NULL DEFAULT NULL'],
  ['rides', 'transactionFeeRate', 'decimal(5,2) NULL DEFAULT NULL'],
  ['rides', 'totalToPay', 'decimal(10,2) NULL DEFAULT NULL'],
  ['rides', 'paymentStatus', 'varchar(20) NOT NULL DEFAULT \'PENDING\''],
  ['rides', 'paymentProvider', 'varchar(60) NULL DEFAULT NULL'],
  ['rides', 'paymentPhone', 'varchar(30) NULL DEFAULT NULL'],
  ['rides', 'paymentExternalId', 'varchar(100) NULL DEFAULT NULL'],
  ['rides', 'paymentTransactionId', 'varchar(100) NULL DEFAULT NULL'],
  ['rides', 'paymentReference', 'varchar(100) NULL DEFAULT NULL'],
  ['rides', 'paymentFailureReason', 'varchar(500) NULL DEFAULT NULL'],
  ['rides', 'paymentStartedAt', 'datetime(6) NULL DEFAULT NULL'],
  ['rides', 'paidAt', 'datetime(6) NULL DEFAULT NULL'],
  ['rides', 'paymentConfirmedById', 'varchar(36) NULL DEFAULT NULL'],
  ['classified_payments', 'transactionFee', 'decimal(14,2) NOT NULL DEFAULT 0'],
  ['classified_payments', 'transactionFeeRate', 'decimal(5,2) NOT NULL DEFAULT 0'],
  ['classified_payments', 'totalAmount', 'decimal(14,2) NULL DEFAULT NULL'],
];

export class PaymentFeesVehicleCommission1793318400000 implements MigrationInterface {
  name = 'PaymentFeesVehicleCommission1793318400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // État avant (les reprises de données ne s'exécutent qu'une fois)
    const hadVehicleCommission = await queryRunner.hasColumn('driver_vehicles', 'commissionRate');
    const hadRidePayment = await queryRunner.hasColumn('rides', 'paymentStatus');
    const hadClassifiedTotal = await queryRunner.hasColumn('classified_payments', 'totalAmount');

    for (const [table, column, definition] of COLUMNS) {
      if (!(await queryRunner.hasTable(table))) continue;
      if (await queryRunner.hasColumn(table, column)) continue;
      await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }

    if (await queryRunner.hasTable('rides')) {
      const idx = await queryRunner.query("SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_payment_status'");
      if (!Number(idx?.[0]?.n)) await queryRunner.query('CREATE INDEX `idx_rides_payment_status` ON `rides` (`paymentStatus`, `paymentStartedAt`)');
    }

    // pricings.commissionRate : plus utilisée → facultative
    const pc = await queryRunner.query("SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pricings' AND COLUMN_NAME = 'commissionRate'");
    if (pc?.[0]?.n === 'NO') await queryRunner.query('ALTER TABLE `pricings` MODIFY COLUMN `commissionRate` decimal(5,2) NULL DEFAULT NULL');

    // Reprises de données
    if (!hadVehicleCommission && (await queryRunner.hasColumn('pricings', 'commissionRate'))) {
      await queryRunner.query('UPDATE `driver_vehicles` v SET v.`commissionRate` = (SELECT MAX(p.`commissionRate`) FROM `pricings` p WHERE p.`categoryId` = v.`categoryId` AND p.`commissionRate` IS NOT NULL) WHERE v.`commissionRate` IS NULL');
    }
    if (!hadRidePayment && (await queryRunner.hasTable('rides'))) {
      await queryRunner.query('UPDATE `rides` SET `paymentStatus` = \'PAID\', `paidAt` = COALESCE(`paidAt`, `completedAt`, `updatedAt`), `totalToPay` = COALESCE(`totalToPay`, `finalPrice`, `price`), `transactionFee` = COALESCE(`transactionFee`, 0) WHERE `status` = \'COMPLETED\'');
    }
    if (!hadClassifiedTotal && (await queryRunner.hasTable('classified_payments'))) {
      await queryRunner.query('UPDATE `classified_payments` SET `totalAmount` = `amount` + `transactionFee` WHERE `totalAmount` IS NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('rides')) {
      const idx = await queryRunner.query("SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND INDEX_NAME = 'idx_rides_payment_status'");
      if (Number(idx?.[0]?.n)) await queryRunner.query('DROP INDEX `idx_rides_payment_status` ON `rides`');
    }
    for (const [table, column] of [...COLUMNS].reverse()) {
      if ((await queryRunner.hasTable(table)) && (await queryRunner.hasColumn(table, column))) {
        await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
      }
    }
  }
}
