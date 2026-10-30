import { MigrationInterface, QueryRunner } from 'typeorm';
import { SupplyBranchStockLogistics1792622400000 } from './1792622400000-SupplyBranchStockLogistics';

/**
 * BackOffice — Logistique interne = biens de l'entreprise (sans lien avec les colis).
 *  - supprime les anciennes tables de transfert de colis si elles sont vides ;
 *  - retire bo_fleet_missions.transferId ;
 *  - crée bo_asset_categories, bo_assets, bo_asset_movements (via la migration précédente, idempotente).
 */
export class LogisticsCompanyAssets1792800000000 implements MigrationInterface {
  name = 'LogisticsCompanyAssets1792800000000';

  private async tableExists(q: QueryRunner, t: string) {
    const r = await q.query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1', [t]);
    return r.length > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    await q.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const t of ['bo_logistics_transfer_items', 'bo_logistics_transfers']) {
        if (!(await this.tableExists(q, t))) continue;
        const [{ n }] = await q.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
        if (Number(n) === 0) await q.query(`DROP TABLE \`${t}\``);
      }
      const col = await q.query(
        "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bo_fleet_missions' AND COLUMN_NAME = 'transferId' LIMIT 1",
      );
      if (col.length) await q.query('ALTER TABLE `bo_fleet_missions` DROP COLUMN `transferId`');
    } finally {
      await q.query('SET FOREIGN_KEY_CHECKS = 1');
    }
    // Crée les tables manquantes (biens de l'entreprise) — sans toucher aux tables existantes
    await new SupplyBranchStockLogistics1792622400000().up(q);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['bo_asset_movements', 'bo_assets', 'bo_asset_categories']) {
      if (await this.tableExists(q, t)) await q.query(`DROP TABLE \`${t}\``);
    }
  }
}
