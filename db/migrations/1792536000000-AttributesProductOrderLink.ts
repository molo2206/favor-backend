import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Attributs : enrichissement + liaison avec les produits et les commandes.
 *
 * Tables modifiées (champs ajoutés) :
 *   - attributes            : isVariant, isVisible, isActive, unit, position, deletedAt (+ types NUMBER, BOOLEAN)
 *   - attribute_values      : isActive
 *   - product_attributes    : isRequired, isVariant, isVisible, position, customValue, createdAt, updatedAt
 *   - product_variations    : name, isDefault, position, deletedAt
 *   - order_items           : variationId, sku, variationLabel, attributesSnapshot
 *   - sub_order_items       : variationId, sku, variationLabel, attributesSnapshot
 *
 * Nouvelles tables :
 *   - product_attribute_values : valeurs autorisées d'un attribut pour un produit (+ supplément de prix)
 *   - order_item_attributes    : attributs choisis par le client pour chaque ligne de commande (copie figée)
 *
 * La migration peut être relancée sans erreur : chaque ajout vérifie d'abord ce qui existe déjà.
 * Les colonnes de clés étrangères reprennent le type / charset / collation de la colonne référencée
 * (sinon MySQL refuse la contrainte).
 */
export class AttributesProductOrderLink1792536000000 implements MigrationInterface {
  name = 'AttributesProductOrderLink1792536000000';

  private readonly TXT = 'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';

  // ------------------------------------------------------------
  // Outils
  // ------------------------------------------------------------

  /** Définition SQL identique à `table`.`column` (type + charset + collation) */
  private async columnDef(qr: QueryRunner, table: string, column = 'id'): Promise<string> {
    const rows = await qr.query(
      `SELECT COLUMN_TYPE AS type, CHARACTER_SET_NAME AS charset, COLLATION_NAME AS coll
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    if (!rows?.length) return 'varchar(36)';
    const { type, charset, coll } = rows[0];
    return [type, charset ? `CHARACTER SET ${charset}` : '', coll ? `COLLATE ${coll}` : '']
      .filter(Boolean)
      .join(' ');
  }

  private async addColumn(qr: QueryRunner, table: string, column: string, definition: string): Promise<void> {
    if (!(await qr.hasTable(table))) return;
    if (await qr.hasColumn(table, column)) return;
    await qr.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }

  private async indexExists(qr: QueryRunner, table: string, index: string): Promise<boolean> {
    const rows = await qr.query(
      `SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [table, index],
    );
    return rows.length > 0;
  }

  private async fkExists(qr: QueryRunner, table: string, fk: string): Promise<boolean> {
    const rows = await qr.query(
      `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
          AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1`,
      [table, fk],
    );
    return rows.length > 0;
  }

  private async addIndex(qr: QueryRunner, table: string, index: string, columns: string): Promise<void> {
    if (!(await qr.hasTable(table))) return;
    if (await this.indexExists(qr, table, index)) return;
    await qr.query(`CREATE INDEX \`${index}\` ON \`${table}\` (${columns})`);
  }

  private async addFk(
    qr: QueryRunner,
    table: string,
    fk: string,
    column: string,
    refTable: string,
    onDelete: 'CASCADE' | 'SET NULL',
  ): Promise<void> {
    if (!(await qr.hasTable(table)) || !(await qr.hasTable(refTable))) return;
    if (await this.fkExists(qr, table, fk)) return;
    await qr.query(
      `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${fk}\` FOREIGN KEY (\`${column}\`)
       REFERENCES \`${refTable}\`(\`id\`) ON DELETE ${onDelete} ON UPDATE NO ACTION`,
    );
  }

  private async dropFk(qr: QueryRunner, table: string, fk: string): Promise<void> {
    if ((await qr.hasTable(table)) && (await this.fkExists(qr, table, fk))) {
      await qr.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk}\``);
    }
  }

  private async dropColumn(qr: QueryRunner, table: string, column: string): Promise<void> {
    if ((await qr.hasTable(table)) && (await qr.hasColumn(table, column))) {
      await qr.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    }
  }

  // ------------------------------------------------------------
  // UP
  // ------------------------------------------------------------
  public async up(qr: QueryRunner): Promise<void> {
    const TXT = this.TXT;

    // ============================================================
    // 1. attributes
    // ============================================================
    if (await qr.hasTable('attributes')) {
      await qr.query(
        `ALTER TABLE \`attributes\` MODIFY COLUMN \`type\`
         enum('TEXT','COLOR','IMAGE','SELECT','NUMBER','BOOLEAN') NOT NULL`,
      );
    }
    await this.addColumn(qr, 'attributes', 'isVariant', 'tinyint NOT NULL DEFAULT 1');
    await this.addColumn(qr, 'attributes', 'isVisible', 'tinyint NOT NULL DEFAULT 1');
    await this.addColumn(qr, 'attributes', 'isActive', 'tinyint NOT NULL DEFAULT 1');
    await this.addColumn(qr, 'attributes', 'unit', `varchar(50) ${TXT} NULL`);
    await this.addColumn(qr, 'attributes', 'position', 'int NOT NULL DEFAULT 0');
    await this.addColumn(qr, 'attributes', 'deletedAt', 'datetime(6) NULL');

    // Les attributs texte libre ne servent pas de variation par défaut
    if (await qr.hasTable('attributes')) {
      await qr.query(`UPDATE \`attributes\` SET \`isVariant\` = 0 WHERE \`type\` = 'TEXT'`);
    }

    // ============================================================
    // 2. attribute_values
    // ============================================================
    await this.addColumn(qr, 'attribute_values', 'isActive', 'tinyint NOT NULL DEFAULT 1');

    // ============================================================
    // 3. product_attributes
    // ============================================================
    await this.addColumn(qr, 'product_attributes', 'isRequired', 'tinyint NOT NULL DEFAULT 0');
    await this.addColumn(qr, 'product_attributes', 'isVariant', 'tinyint NOT NULL DEFAULT 1');
    await this.addColumn(qr, 'product_attributes', 'isVisible', 'tinyint NOT NULL DEFAULT 1');
    await this.addColumn(qr, 'product_attributes', 'position', 'int NOT NULL DEFAULT 0');
    await this.addColumn(qr, 'product_attributes', 'customValue', `varchar(255) ${TXT} NULL`);
    await this.addColumn(qr, 'product_attributes', 'createdAt', 'datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)');
    await this.addColumn(
      qr,
      'product_attributes',
      'updatedAt',
      'datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)',
    );

    // ============================================================
    // 4. product_variations
    // ============================================================
    await this.addColumn(qr, 'product_variations', 'name', `varchar(255) ${TXT} NULL`);
    await this.addColumn(qr, 'product_variations', 'isDefault', 'tinyint NOT NULL DEFAULT 0');
    await this.addColumn(qr, 'product_variations', 'position', 'int NOT NULL DEFAULT 0');
    await this.addColumn(qr, 'product_variations', 'deletedAt', 'datetime(6) NULL');

    // ============================================================
    // 5. product_attribute_values (NOUVELLE TABLE)
    // ============================================================
    if (!(await qr.hasTable('product_attribute_values'))) {
      const paId = await this.columnDef(qr, 'product_attributes');
      const productId = await this.columnDef(qr, 'products');
      const attributeId = await this.columnDef(qr, 'attributes');
      const valueId = await this.columnDef(qr, 'attribute_values');

      await qr.query(`
        CREATE TABLE \`product_attribute_values\` (
          \`id\` varchar(36) NOT NULL,
          \`productAttributeId\` ${paId} NOT NULL,
          \`productId\` ${productId} NOT NULL,
          \`attributeId\` ${attributeId} NOT NULL,
          \`attributeValueId\` ${valueId} NOT NULL,
          \`priceAdjustment\` decimal(10,2) NOT NULL DEFAULT 0,
          \`isDefault\` tinyint NOT NULL DEFAULT 0,
          \`isActive\` tinyint NOT NULL DEFAULT 1,
          \`position\` int NOT NULL DEFAULT 0,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`uq_pav_product_attribute_value\` (\`productAttributeId\`, \`attributeValueId\`),
          INDEX \`idx_pav_product\` (\`productId\`),
          INDEX \`idx_pav_attribute\` (\`attributeId\`),
          INDEX \`idx_pav_value\` (\`attributeValueId\`)
        ) ENGINE=InnoDB
      `);
    }
    await this.addFk(qr, 'product_attribute_values', 'FK_pav_product_attribute', 'productAttributeId', 'product_attributes', 'CASCADE');
    await this.addFk(qr, 'product_attribute_values', 'FK_pav_product', 'productId', 'products', 'CASCADE');
    await this.addFk(qr, 'product_attribute_values', 'FK_pav_attribute', 'attributeId', 'attributes', 'CASCADE');
    await this.addFk(qr, 'product_attribute_values', 'FK_pav_attribute_value', 'attributeValueId', 'attribute_values', 'CASCADE');

    // ============================================================
    // 6. order_items / sub_order_items
    // ============================================================
    const variationId = await this.columnDef(qr, 'product_variations');
    for (const table of ['order_items', 'sub_order_items']) {
      await this.addColumn(qr, table, 'variationId', `${variationId} NULL`);
      await this.addColumn(qr, table, 'sku', `varchar(255) ${TXT} NULL`);
      await this.addColumn(qr, table, 'variationLabel', `varchar(500) ${TXT} NULL`);
      await this.addColumn(qr, table, 'attributesSnapshot', 'json NULL');
    }
    await this.addIndex(qr, 'order_items', 'idx_order_items_variation', '`variationId`');
    await this.addIndex(qr, 'sub_order_items', 'idx_sub_order_items_variation', '`variationId`');
    await this.addFk(qr, 'order_items', 'FK_order_items_variation', 'variationId', 'product_variations', 'SET NULL');
    await this.addFk(qr, 'sub_order_items', 'FK_sub_order_items_variation', 'variationId', 'product_variations', 'SET NULL');

    // ============================================================
    // 7. order_item_attributes (NOUVELLE TABLE)
    // ============================================================
    if (!(await qr.hasTable('order_item_attributes'))) {
      const orderItemId = await this.columnDef(qr, 'order_items');
      const orderId = await this.columnDef(qr, 'orders');
      const attributeId = await this.columnDef(qr, 'attributes');
      const valueId = await this.columnDef(qr, 'attribute_values');

      await qr.query(`
        CREATE TABLE \`order_item_attributes\` (
          \`id\` varchar(36) NOT NULL,
          \`orderItemId\` ${orderItemId} NOT NULL,
          \`orderId\` ${orderId} NOT NULL,
          \`attributeId\` ${attributeId} NULL,
          \`attributeValueId\` ${valueId} NULL,
          \`attributeName\` varchar(255) ${TXT} NOT NULL,
          \`attributeSlug\` varchar(255) ${TXT} NULL,
          \`attributeType\` varchar(30) NULL,
          \`value\` varchar(255) ${TXT} NOT NULL,
          \`displayName\` varchar(255) ${TXT} NULL,
          \`color\` varchar(50) NULL,
          \`imageUrl\` varchar(500) NULL,
          \`priceAdjustment\` decimal(10,2) NOT NULL DEFAULT 0,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          INDEX \`idx_oia_order_item\` (\`orderItemId\`),
          INDEX \`idx_oia_order\` (\`orderId\`),
          INDEX \`idx_oia_attribute\` (\`attributeId\`),
          INDEX \`idx_oia_attribute_value\` (\`attributeValueId\`)
        ) ENGINE=InnoDB
      `);
    }
    await this.addFk(qr, 'order_item_attributes', 'FK_oia_order_item', 'orderItemId', 'order_items', 'CASCADE');
    await this.addFk(qr, 'order_item_attributes', 'FK_oia_attribute', 'attributeId', 'attributes', 'SET NULL');
    await this.addFk(qr, 'order_item_attributes', 'FK_oia_attribute_value', 'attributeValueId', 'attribute_values', 'SET NULL');

    // ============================================================
    // 8. Reprise des données existantes
    //    Les attributs / valeurs déjà utilisés par des variations deviennent
    //    des attributs du produit avec leurs valeurs autorisées.
    // ============================================================
    if (
      (await qr.hasTable('variation_attribute_values')) &&
      (await qr.hasTable('product_variations')) &&
      (await qr.hasTable('product_attributes'))
    ) {
      await qr.query(`
        INSERT INTO \`product_attributes\` (\`id\`, \`productId\`, \`attributeId\`, \`isRequired\`, \`isVariant\`, \`isVisible\`, \`position\`)
        SELECT UUID(), src.productId, src.attributeId, 0, 1, 1, 0
          FROM (
            SELECT DISTINCT pv.\`productId\` AS productId, vav.\`attributeId\` AS attributeId
              FROM \`variation_attribute_values\` vav
              INNER JOIN \`product_variations\` pv ON pv.\`id\` = vav.\`variationId\`
          ) src
         WHERE NOT EXISTS (
           SELECT 1 FROM \`product_attributes\` pa
            WHERE pa.\`productId\` = src.productId AND pa.\`attributeId\` = src.attributeId
         )
      `);

      await qr.query(`
        INSERT INTO \`product_attribute_values\`
          (\`id\`, \`productAttributeId\`, \`productId\`, \`attributeId\`, \`attributeValueId\`,
           \`priceAdjustment\`, \`isDefault\`, \`isActive\`, \`position\`)
        SELECT UUID(), pa.\`id\`, src.productId, src.attributeId, src.attributeValueId, 0, 0, 1, 0
          FROM (
            SELECT DISTINCT pv.\`productId\` AS productId, vav.\`attributeId\` AS attributeId,
                            vav.\`attributeValueId\` AS attributeValueId
              FROM \`variation_attribute_values\` vav
              INNER JOIN \`product_variations\` pv ON pv.\`id\` = vav.\`variationId\`
          ) src
          INNER JOIN \`product_attributes\` pa
                  ON pa.\`productId\` = src.productId AND pa.\`attributeId\` = src.attributeId
         WHERE NOT EXISTS (
           SELECT 1 FROM \`product_attribute_values\` x
            WHERE x.\`productAttributeId\` = pa.\`id\` AND x.\`attributeValueId\` = src.attributeValueId
         )
      `);
    }
  }

  // ------------------------------------------------------------
  // DOWN
  // ------------------------------------------------------------
  public async down(qr: QueryRunner): Promise<void> {
    // Nouvelles tables
    if (await qr.hasTable('order_item_attributes')) await qr.query('DROP TABLE `order_item_attributes`');
    if (await qr.hasTable('product_attribute_values')) await qr.query('DROP TABLE `product_attribute_values`');

    // order_items / sub_order_items
    await this.dropFk(qr, 'order_items', 'FK_order_items_variation');
    await this.dropFk(qr, 'sub_order_items', 'FK_sub_order_items_variation');
    for (const table of ['order_items', 'sub_order_items']) {
      for (const column of ['attributesSnapshot', 'variationLabel', 'sku', 'variationId']) {
        await this.dropColumn(qr, table, column);
      }
    }

    // product_variations
    for (const column of ['deletedAt', 'position', 'isDefault', 'name']) {
      await this.dropColumn(qr, 'product_variations', column);
    }

    // product_attributes
    for (const column of ['updatedAt', 'createdAt', 'customValue', 'position', 'isVisible', 'isVariant', 'isRequired']) {
      await this.dropColumn(qr, 'product_attributes', column);
    }

    // attribute_values
    await this.dropColumn(qr, 'attribute_values', 'isActive');

    // attributes
    for (const column of ['deletedAt', 'position', 'unit', 'isActive', 'isVisible', 'isVariant']) {
      await this.dropColumn(qr, 'attributes', column);
    }
    if (await qr.hasTable('attributes')) {
      await qr.query(
        `UPDATE \`attributes\` SET \`type\` = 'TEXT' WHERE \`type\` IN ('NUMBER','BOOLEAN')`,
      );
      await qr.query(
        `ALTER TABLE \`attributes\` MODIFY COLUMN \`type\` enum('TEXT','COLOR','IMAGE','SELECT') NOT NULL`,
      );
    }
  }
}
