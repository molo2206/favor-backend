import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Annonces : tarifs de publication par type de produit (classified_pricing_plans.productType). Idempotente.
 * Script SQL équivalent : db/sql/annonces_tarifs_par_type_produit.sql
 */
export class ClassifiedPricingProductType1793750400000 implements MigrationInterface {
  name = 'ClassifiedPricingProductType1793750400000';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('classified_pricing_plans'))) return;
    if (!(await q.hasColumn('classified_pricing_plans', 'productType'))) {
      await q.query('ALTER TABLE `classified_pricing_plans` ADD COLUMN `productType` varchar(30) NULL DEFAULT NULL AFTER `description`');
    }
    const idx = await q.query(
      "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classified_pricing_plans' AND INDEX_NAME = 'idx_classified_plan_type'",
    );
    if (!Number(idx?.[0]?.n)) {
      await q.query('CREATE INDEX `idx_classified_plan_type` ON `classified_pricing_plans` (`productType`, `isActive`)');
    }
    await q.query('UPDATE `classified_pricing_plans` SET `productType` = UPPER(TRIM(`productType`)) WHERE `productType` IS NOT NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('classified_pricing_plans'))) return;
    const idx = await q.query(
      "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classified_pricing_plans' AND INDEX_NAME = 'idx_classified_plan_type'",
    );
    if (Number(idx?.[0]?.n)) await q.query('DROP INDEX `idx_classified_plan_type` ON `classified_pricing_plans`');
    if (await q.hasColumn('classified_pricing_plans', 'productType')) {
      await q.query('ALTER TABLE `classified_pricing_plans` DROP COLUMN `productType`');
    }
  }
}
