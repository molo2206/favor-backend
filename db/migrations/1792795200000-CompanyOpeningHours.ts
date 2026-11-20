import { MigrationInterface, QueryRunner } from 'typeorm';

/** Entreprises : jours d'ouverture + heure d'ouverture / de fermeture (idempotente) */
const COLUMNS: [string, string][] = [
  ['opening_days', 'json NULL'],
  ['opening_time', 'varchar(5) NULL DEFAULT NULL'],
  ['closing_time', 'varchar(5) NULL DEFAULT NULL'],
];

export class CompanyOpeningHours1792795200000 implements MigrationInterface {
  name = 'CompanyOpeningHours1792795200000';

  private async hasColumn(q: QueryRunner, col: string) {
    const r = await q.query(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company' AND COLUMN_NAME = ? LIMIT 1",
      [col],
    );
    return r.length > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    for (const [col, def] of COLUMNS) {
      if (!(await this.hasColumn(q, col))) await q.query(`ALTER TABLE \`company\` ADD COLUMN \`${col}\` ${def}`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const [col] of [...COLUMNS].reverse()) {
      if (await this.hasColumn(q, col)) await q.query(`ALTER TABLE \`company\` DROP COLUMN \`${col}\``);
    }
  }
}
