import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Performance : index des listes de l'administration. Idempotente.
 *    Script SQL équivalent : db/sql/performance_index.sql
 */
const INDEXES: [string, string, string][] = [
  ['shipments', 'idx_perf_shipments_created', 'createdAt'],
  ['users', 'idx_perf_users_created', 'createdAt'],
  ['users', 'idx_perf_users_role', 'role'],
  ['orders', 'idx_perf_orders_created', 'createdAt'],
  ['orders', 'idx_perf_orders_type_created', 'type`, `createdAt'],
  ['delivery', 'idx_perf_delivery_created', 'createdAt'],
];

export class PerformanceIndexes1795824000000 implements MigrationInterface {
  name = 'PerformanceIndexes1795824000000';

  public async up(q: QueryRunner): Promise<void> {
    for (const [table, name, column] of INDEXES) {
      const t = await q.getTable(table);
      if (!t || t.indices.some((i) => i.name === name)) continue;
      await q.query(`CREATE INDEX \`${name}\` ON \`${table}\` (\`${column}\`)`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const [table, name] of INDEXES) {
      const t = await q.getTable(table);
      if (t?.indices.some((i) => i.name === name)) await q.query(`DROP INDEX \`${name}\` ON \`${table}\``);
    }
  }
}
