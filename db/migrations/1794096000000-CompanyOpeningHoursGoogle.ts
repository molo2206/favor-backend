import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Horaires d'ouverture des entreprises « comme Google » : opening_hours, special_hours, opening_status,
 * reopen_date, timezone. Idempotente. Script SQL équivalent : db/sql/horaires_ouverture_google.sql
 */
export class CompanyOpeningHoursGoogle1794096000000 implements MigrationInterface {
  name = 'CompanyOpeningHoursGoogle1794096000000';

  private async addColumn(q: QueryRunner, name: string, ddl: string) {
    if (!(await q.hasColumn('company', name))) await q.query(`ALTER TABLE \`company\` ADD COLUMN \`${name}\` ${ddl}`);
  }

  public async up(q: QueryRunner): Promise<void> {
    await this.addColumn(q, 'opening_hours', 'json NULL');
    await this.addColumn(q, 'special_hours', 'json NULL');
    await this.addColumn(q, 'opening_status', "varchar(30) NOT NULL DEFAULT 'OPERATIONAL'");
    await this.addColumn(q, 'reopen_date', 'date NULL');
    await this.addColumn(q, 'timezone', 'varchar(64) NULL');
    await this.addColumn(q, 'opening_days', 'json NULL');
    await this.addColumn(q, 'opening_time', 'varchar(5) NULL');
    await this.addColumn(q, 'closing_time', 'varchar(5) NULL');
    await q.query(
      'UPDATE `company` c LEFT JOIN `countries` co ON co.id = c.countryId SET c.timezone = CASE ' +
        "WHEN UPPER(co.code) IN ('CD','COD') AND (CASE WHEN c.longitude REGEXP '^-?[0-9]+([.][0-9]+)?$' THEN CAST(c.longitude AS DECIMAL(10,6)) ELSE NULL END) BETWEEN 0.000001 AND 21.499999 THEN 'Africa/Kinshasa' " +
        "WHEN UPPER(co.code) IN ('CD','COD') THEN 'Africa/Lubumbashi' " +
        "WHEN UPPER(co.code) IN ('RW','RWA') THEN 'Africa/Kigali' " +
        "WHEN UPPER(co.code) IN ('BI','BDI') THEN 'Africa/Bujumbura' " +
        "WHEN UPPER(co.code) IN ('UG','UGA') THEN 'Africa/Kampala' " +
        "WHEN UPPER(co.code) IN ('BJ','BEN') THEN 'Africa/Porto-Novo' " +
        "WHEN UPPER(co.code) IN ('AE','ARE') THEN 'Asia/Dubai' " +
        "ELSE 'Africa/Lubumbashi' END WHERE c.timezone IS NULL OR c.timezone = ''",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const col of ['opening_hours', 'special_hours', 'opening_status', 'reopen_date', 'timezone']) {
      if (await q.hasColumn('company', col)) await q.query(`ALTER TABLE \`company\` DROP COLUMN \`${col}\``);
    }
  }
}
