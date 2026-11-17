import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Devise des courses + portefeuilles chauffeur PAR DEVISE + retrait vers le compte F-Pay. Idempotente.
 * Script SQL équivalent : db/sql/portefeuilles_chauffeurs_devises.sql
 */
export class DriverWalletsByCurrency1794182400000 implements MigrationInterface {
  name = 'DriverWalletsByCurrency1794182400000';

  private async userCol(q: QueryRunner): Promise<string> {
    const r = await q.query(
      "SELECT COLUMN_TYPE AS t, CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id' LIMIT 1",
    );
    const c = r?.[0] ?? {};
    return `${c.t || 'varchar(36)'}${c.cs ? ` CHARACTER SET ${c.cs} COLLATE ${c.coll}` : ''}`;
  }

  public async up(q: QueryRunner): Promise<void> {
    const def = String(process.env.RIDE_PRICING_CURRENCY || 'USD').toUpperCase().replace(/[^A-Z]/g, '') || 'USD';

    // 1) Devise des anciennes courses : tarif de la ville, sinon devise par défaut
    if (await q.hasColumn('cities', 'tarif')) {
      await q.query(
        "UPDATE `rides` r LEFT JOIN `cities` c ON c.id = r.cityId " +
          "SET r.currency = UPPER(COALESCE(NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.tarif, '$.currency')), 'null'), ''), ?)) " +
          "WHERE r.currency IS NULL OR r.currency = ''",
        [def],
      );
    } else {
      await q.query("UPDATE `rides` SET currency = ? WHERE currency IS NULL OR currency = ''", [def]);
    }
    await q.query('UPDATE `rides` SET currency = UPPER(TRIM(currency)) WHERE currency <> UPPER(TRIM(currency))');

    // 2) Portefeuilles par devise
    if (!(await q.hasTable('driver_wallets'))) {
      const tbl = await q.query("SELECT TABLE_COLLATION AS coll FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' LIMIT 1");
      const coll = tbl?.[0]?.coll || 'utf8mb4_unicode_ci';
      const cs = String(coll).split('_')[0] || 'utf8mb4';
      const userCol = await this.userCol(q);
      await q.query(
        'CREATE TABLE `driver_wallets` (' +
          '`id` varchar(36) NOT NULL, ' +
          `\`driverId\` ${userCol} NOT NULL, ` +
          "`currency` varchar(10) NOT NULL, `status` varchar(20) NOT NULL DEFAULT 'ACTIVE', " +
          '`earned` decimal(14,2) NOT NULL DEFAULT 0, `withdrawn` decimal(14,2) NOT NULL DEFAULT 0, ' +
          '`available` decimal(14,2) NOT NULL DEFAULT 0, `ridesCount` int NOT NULL DEFAULT 0, ' +
          '`fpayWalletId` varchar(64) NULL DEFAULT NULL, ' +
          '`firstRideId` varchar(36) NULL DEFAULT NULL, `lastSyncedAt` datetime(6) NULL DEFAULT NULL, ' +
          '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
          '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
          'PRIMARY KEY (`id`), UNIQUE KEY `uq_driver_wallet_currency` (`driverId`, `currency`), ' +
          'CONSTRAINT `fk_driver_wallet_driver` FOREIGN KEY (`driverId`) REFERENCES `users` (`id`) ON DELETE CASCADE' +
          `) ENGINE=InnoDB DEFAULT CHARSET=${cs} COLLATE=${coll}`,
      );
    }

    if (!(await q.hasColumn('driver_wallets', 'fpayWalletId'))) {
      await q.query('ALTER TABLE `driver_wallets` ADD COLUMN `fpayWalletId` varchar(64) NULL DEFAULT NULL AFTER `ridesCount`');
    }

    // 3) Retraits : destination, compte F-Pay crédité, portefeuille débité
    if (await q.hasTable('driver_cashouts')) {
      if (!(await q.hasColumn('driver_cashouts', 'destination'))) {
        await q.query("ALTER TABLE `driver_cashouts` ADD COLUMN `destination` varchar(20) NOT NULL DEFAULT 'MOBILE_MONEY' AFTER `paymentMethodId`");
      }
      if (!(await q.hasColumn('driver_cashouts', 'fpayAccountId'))) {
        await q.query('ALTER TABLE `driver_cashouts` ADD COLUMN `fpayAccountId` varchar(64) NULL DEFAULT NULL AFTER `phone`');
      }
      if (!(await q.hasColumn('driver_cashouts', 'driverWalletId'))) {
        await q.query('ALTER TABLE `driver_cashouts` ADD COLUMN `driverWalletId` varchar(36) NULL DEFAULT NULL AFTER `fpayAccountId`');
      }
    }

    // 4) Portefeuilles des courses déjà attribuées et des retraits existants
    await q.query(
      'INSERT IGNORE INTO `driver_wallets` (id, driverId, currency, status, earned, withdrawn, available, ridesCount, firstRideId) ' +
        "SELECT UUID(), r.driverId, UPPER(r.currency), 'ACTIVE', 0, 0, 0, SUM(r.status = 'COMPLETED'), MIN(r.id) " +
        "FROM `rides` r WHERE r.driverId IS NOT NULL AND r.currency IS NOT NULL AND r.currency <> '' " +
        'GROUP BY r.driverId, UPPER(r.currency)',
    );
    if (await q.hasTable('driver_cashouts')) {
      await q.query(
        "INSERT IGNORE INTO `driver_wallets` (id, driverId, currency, status) SELECT UUID(), c.driverId, UPPER(c.currency), 'ACTIVE' " +
          'FROM `driver_cashouts` c GROUP BY c.driverId, UPPER(c.currency)',
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasTable('driver_cashouts')) {
      for (const col of ['driverWalletId', 'fpayAccountId', 'destination']) {
        if (await q.hasColumn('driver_cashouts', col)) await q.query(`ALTER TABLE \`driver_cashouts\` DROP COLUMN \`${col}\``);
      }
    }
    if (await q.hasTable('driver_wallets')) await q.query('DROP TABLE `driver_wallets`');
    // La devise remplie sur les anciennes courses est conservée (aucune perte de donnée)
  }
}
