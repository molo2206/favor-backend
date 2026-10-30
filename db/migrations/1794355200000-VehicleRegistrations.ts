import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enregistrement des véhicules (vente / location) avec propriétaire, commissionnaire et images :
 * vehicle_registrations.
 *
 * Idempotente : chaque table / index / clé étrangère n'est créé que s'il n'existe pas.
 * Ne modifie aucune table existante. Les colonnes de clés étrangères sont alignées sur le type
 * + charset + collation de `ref`.`id` (évite l'erreur MySQL #3780).
 * Script SQL équivalent : db/sql/vehicules_enregistres.sql
 */
type TableSpec = {
  name: string;
  columns: string[];
  keys: [string, string, boolean][];
  fks: [string, string, string, string][];
};

const SPEC: { tables: TableSpec[] } = {
  "tables": [
    {
      "name": "vehicle_registrations",
      "columns": [
        "`id` varchar(36) NOT NULL",
        "`reference` varchar(30) NOT NULL",
        "`name` varchar(150) NOT NULL",
        "`brand` varchar(100) NOT NULL",
        "`year` int NULL DEFAULT NULL",
        "`color` varchar(50) NULL DEFAULT NULL",
        "`transmission` enum('MANUAL','AUTOMATIC','SEMI_AUTOMATIQUE') NULL DEFAULT NULL",
        "`mileage` int NULL DEFAULT NULL",
        "`plateNumber` varchar(30) NULL DEFAULT NULL",
        "`engineCondition` enum('EXCELLENT','GOOD','AVERAGE','NEEDS_REPAIR','NOT_WORKING') NULL DEFAULT NULL",
        "`originality` enum('ORIGINAL','MODIFIED','ACCIDENTED','MODIFIED_AND_ACCIDENTED') NULL DEFAULT NULL",
        "`availableDocuments` json NULL",
        "`locationAddress` varchar(255) NULL DEFAULT NULL",
        "`city` varchar(100) NULL DEFAULT NULL",
        "`latitude` decimal(10,7) NULL DEFAULT NULL",
        "`longitude` decimal(10,7) NULL DEFAULT NULL",
        "`registrationType` enum('SALE','RENTAL') NOT NULL",
        "`priceMin` decimal(14,2) NOT NULL",
        "`priceMax` decimal(14,2) NOT NULL",
        "`currency` varchar(3) NOT NULL DEFAULT 'USD'",
        "`ownerName` varchar(150) NOT NULL",
        "`ownerAddress` varchar(255) NULL DEFAULT NULL",
        "`ownerPhone` varchar(30) NOT NULL",
        "`brokerName` varchar(150) NULL DEFAULT NULL",
        "`brokerPhone` varchar(30) NULL DEFAULT NULL",
        "`brokerAmount` decimal(14,2) NULL DEFAULT NULL",
        "`images` json NULL",
        "`status` enum('AVAILABLE','RESERVED','SOLD','RENTED','WITHDRAWN') NOT NULL DEFAULT 'AVAILABLE'",
        "`notes` text NULL",
        "`createdById` varchar(36) NULL DEFAULT NULL",
        "`updatedById` varchar(36) NULL DEFAULT NULL",
        "`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)",
        "`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)",
        "`deletedAt` datetime(6) NULL DEFAULT NULL"
      ],
      "keys": [
        [
          "uq_vr_reference",
          "reference",
          true
        ],
        [
          "idx_vr_type_status",
          "registrationType,status",
          false
        ],
        [
          "idx_vr_plate",
          "plateNumber",
          false
        ],
        [
          "idx_vr_owner_phone",
          "ownerPhone",
          false
        ],
        [
          "idx_vr_broker_phone",
          "brokerPhone",
          false
        ],
        [
          "idx_vr_created_by",
          "createdById",
          false
        ]
      ],
      "fks": [
        [
          "createdById",
          "users",
          "fk_vr_created_by",
          "SET NULL"
        ]
      ]
    }
  ]
};

export class VehicleRegistrations1794355200000 implements MigrationInterface {
  name = 'VehicleRegistrations1794355200000';

  private async tableExists(q: QueryRunner, table: string): Promise<boolean> {
    const r = await q.query(
      'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
      [table],
    );
    return r.length > 0;
  }

  private async column(q: QueryRunner, table: string, col: string) {
    const r = await q.query(
      'SELECT COLUMN_TYPE AS type, CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll, IS_NULLABLE AS nullable ' +
        'FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
      [table, col],
    );
    return r[0] as { type: string; cs: string | null; coll: string | null; nullable: string } | undefined;
  }

  private async indexExists(q: QueryRunner, table: string, index: string): Promise<boolean> {
    const r = await q.query(
      'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
      [table, index],
    );
    return r.length > 0;
  }

  private async fkExists(q: QueryRunner, table: string, fk: string): Promise<boolean> {
    const r = await q.query(
      "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1",
      [table, fk],
    );
    return r.length > 0;
  }

  private async addIndex(q: QueryRunner, table: string, name: string, cols: string, unique: boolean) {
    if (await this.indexExists(q, table, name)) return;
    const list = cols.split(',').map((c) => `\`${c.trim()}\``).join(', ');
    await q.query(`ALTER TABLE \`${table}\` ADD ${unique ? 'UNIQUE ' : ''}INDEX \`${name}\` (${list})`);
  }

  public async up(q: QueryRunner): Promise<void> {
    // Charset / collation de référence : ceux de `shipments`
    const ref = await q.query(
      'SELECT t.TABLE_COLLATION AS coll, c.CHARACTER_SET_NAME AS cs FROM information_schema.TABLES t ' +
        'JOIN information_schema.COLLATION_CHARACTER_SET_APPLICABILITY c ON c.COLLATION_NAME = t.TABLE_COLLATION ' +
        "WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = 'shipments' LIMIT 1",
    );
    const cs = ref[0]?.cs || 'utf8mb4';
    const coll = ref[0]?.coll || 'utf8mb4_unicode_ci';

    // 1) Tables + index
    for (const t of SPEC.tables) {
      if (!(await this.tableExists(q, t.name))) {
        await q.query(
          `CREATE TABLE \`${t.name}\` (${[...t.columns, 'PRIMARY KEY (\`id\`)'].join(', ')}) ` +
            `ENGINE=InnoDB DEFAULT CHARSET=${cs} COLLATE=${coll}`,
        );
      }
      for (const [name, cols, unique] of t.keys) await this.addIndex(q, t.name, name, cols, unique);
    }

    // 1 bis) Originalité : table déjà créée avec l'ancienne liste → nouvelle liste (modifié / accidenté / ni l'un ni l'autre)
    const orig = await this.column(q, 'vehicle_registrations', 'originality');
    if (orig && orig.type.includes('PARTIALLY_ORIGINAL')) {
      await q.query(
        "ALTER TABLE `vehicle_registrations` MODIFY `originality` enum('ORIGINAL','PARTIALLY_ORIGINAL','NOT_ORIGINAL','MODIFIED','ACCIDENTED','MODIFIED_AND_ACCIDENTED') NULL DEFAULT NULL",
      );
      await q.query("UPDATE `vehicle_registrations` SET `originality` = NULL WHERE `originality` IN ('PARTIALLY_ORIGINAL','NOT_ORIGINAL')");
      await q.query(
        "ALTER TABLE `vehicle_registrations` MODIFY `originality` enum('ORIGINAL','MODIFIED','ACCIDENTED','MODIFIED_AND_ACCIDENTED') NULL DEFAULT NULL",
      );
    }

    // 2) Clés étrangères (colonne alignée sur la colonne référencée)
    for (const t of SPEC.tables) {
      for (const [col, refTable, fk, onDelete] of t.fks) {
        if (!(await this.tableExists(q, refTable))) continue;
        if (await this.fkExists(q, t.name, fk)) continue;
        const target = await this.column(q, refTable, 'id');
        const current = await this.column(q, t.name, col);
        if (!target || !current) continue;
        if (current.type !== target.type || (current.coll || '') !== (target.coll || '')) {
          const charset = target.cs ? ` CHARACTER SET ${target.cs} COLLATE ${target.coll}` : '';
          const nullable = current.nullable === 'YES' ? ' NULL DEFAULT NULL' : ' NOT NULL';
          await q.query(`ALTER TABLE \`${t.name}\` MODIFY \`${col}\` ${target.type}${charset}${nullable}`);
        }
        await q.query(
          `ALTER TABLE \`${t.name}\` ADD CONSTRAINT \`${fk}\` FOREIGN KEY (\`${col}\`) ` +
            `REFERENCES \`${refTable}\` (\`id\`) ON DELETE ${onDelete} ON UPDATE NO ACTION`,
        );
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    // Ordre inverse (dépendances)
    for (const t of [...SPEC.tables].reverse()) {
      if (await this.tableExists(q, t.name)) await q.query(`DROP TABLE \`${t.name}\``);
    }
  }
}
