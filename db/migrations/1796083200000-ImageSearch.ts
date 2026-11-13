import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Recherche par image : index sémantique des produits.
 *    Script SQL équivalent : db/sql/recherche_par_image.sql
 */
export class ImageSearch1796083200000 implements MigrationInterface {
  name = 'ImageSearch1796083200000';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('product_search_embeddings'))) {
      await q.query(`CREATE TABLE \`product_search_embeddings\` (
        \`id\` varchar(36) NOT NULL,
        \`productId\` varchar(36) NOT NULL,
        \`model\` varchar(60) NOT NULL,
        \`dims\` int NOT NULL,
        \`vector\` mediumtext NOT NULL,
        \`textHash\` char(64) NOT NULL,
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_product_search_embedding\` (\`productId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    for (const sql of [
      'ALTER TABLE `products` ADD INDEX `idx_products_status_search` (`status`)',
      'ALTER TABLE `image_product_entity` ADD INDEX `idx_image_product_hash` (`productId`, `imageHashPhash`)',
    ]) {
      try {
        await q.query(sql);
      } catch {
        /* index déjà présent */
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `product_search_embeddings`');
  }
}
