import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Colis : devise des prix (USD par défaut pour les colis existants).
 *    Script SQL équivalent : db/sql/colis_devise.sql
 */
export class ShipmentCurrency1795737600000 implements MigrationInterface {
  name = 'ShipmentCurrency1795737600000';

  public async up(q: QueryRunner): Promise<void> {
    if ((await q.hasTable('shipments')) && !(await q.hasColumn('shipments', 'currency'))) {
      await q.query("ALTER TABLE `shipments` ADD COLUMN `currency` varchar(10) NOT NULL DEFAULT 'USD'");
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    // Colonne conservée (données de prix).
  }
}
