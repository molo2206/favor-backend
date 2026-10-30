import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Disponibilité des produits d'une commande confirmée par leur propriétaire.
 * Ajoute 4 colonnes NULL sur order_items (aucune autre table, aucune donnée existante modifiée).
 * Idempotente. Script SQL équivalent : db/sql/disponibilite_produits_commandes.sql
 */
export class OrderItemAvailability1794700800000 implements MigrationInterface {
  name = 'OrderItemAvailability1794700800000';

  private readonly columns: [string, string][] = [
    ['availabilityStatus', "enum('PENDING','AVAILABLE','UNAVAILABLE') NULL DEFAULT NULL"],
    ['availabilityConfirmedAt', 'datetime(6) NULL DEFAULT NULL'],
    ['availabilityConfirmedById', 'varchar(36) NULL DEFAULT NULL'],
    ['availabilityNote', 'varchar(500) NULL DEFAULT NULL'],
  ];

  private async hasColumn(q: QueryRunner, column: string): Promise<boolean> {
    const r = await q.query(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = ? LIMIT 1",
      [column],
    );
    return r.length > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    for (const [column, definition] of this.columns) {
      if (!(await this.hasColumn(q, column))) await q.query(`ALTER TABLE \`order_items\` ADD \`${column}\` ${definition}`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const [column] of this.columns) {
      if (await this.hasColumn(q, column)) await q.query(`ALTER TABLE \`order_items\` DROP COLUMN \`${column}\``);
    }
  }
}
