import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quotas SMS par pays, liés à la table `countries` :
 *  - sms_recharges.countryId → countries.id (NULL = quota commun) — ON DELETE RESTRICT
 *  - sms_logs.countryId      → countries.id                         — ON DELETE SET NULL
 * Idempotente. Les recharges existantes restent le quota commun.
 * Si l'ancienne colonne countryCode existe : convertie en countryId (countries.code), puis supprimée
 * (sauf si des recharges n'ont pas de pays correspondant).
 * Script SQL équivalent : db/sql/quotas_sms_par_pays.sql
 */
export class SmsQuotaByCountry1794441600000 implements MigrationInterface {
  name = 'SmsQuotaByCountry1794441600000';

  private readonly FK_RECHARGES = 'FK_e16f5239bc013d6d9c12b766d46';
  private readonly FK_LOGS = 'FK_a29755d79edacac00022a2ebd20';
  private readonly IDX = 'idx_sms_recharges_cat_country_status';

  private async exists(q: QueryRunner, sql: string, params: any[]): Promise<boolean> {
    const r = await q.query(sql, params);
    return r.length > 0;
  }

  private columnExists(q: QueryRunner, table: string, col: string) {
    return this.exists(
      q,
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
      [table, col],
    );
  }

  private tableExists(q: QueryRunner, table: string) {
    return this.exists(q, 'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1', [table]);
  }

  private indexExists(q: QueryRunner, table: string, index: string, column?: string) {
    return this.exists(
      q,
      'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?' +
        (column ? ' AND COLUMN_NAME = ?' : '') +
        ' LIMIT 1',
      column ? [table, index, column] : [table, index],
    );
  }

  private fkExists(q: QueryRunner, table: string, name: string) {
    return this.exists(
      q,
      "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1",
      [table, name],
    );
  }

  /** Définition identique à countries.id (type + collation), obligatoire pour la clé étrangère */
  private async countryIdDefinition(q: QueryRunner): Promise<string> {
    const rows = await q.query(
      "SELECT COLUMN_TYPE AS t, CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'countries' AND COLUMN_NAME = 'id'",
    );
    if (!rows.length) throw new Error('Table countries introuvable');
    const { t, cs, coll } = rows[0];
    return `${t}${cs ? ` CHARACTER SET ${cs} COLLATE ${coll}` : ''} NULL DEFAULT NULL`;
  }

  public async up(q: QueryRunner): Promise<void> {
    const def = await this.countryIdDefinition(q);
    const hasLogs = await this.tableExists(q, 'sms_logs');

    // 1) Colonnes countryId
    if (!(await this.columnExists(q, 'sms_recharges', 'countryId'))) {
      await q.query(`ALTER TABLE \`sms_recharges\` ADD COLUMN \`countryId\` ${def} AFTER \`category\``);
    }
    if (hasLogs && !(await this.columnExists(q, 'sms_logs', 'countryId'))) {
      await q.query(`ALTER TABLE \`sms_logs\` ADD COLUMN \`countryId\` ${def} AFTER \`recipient\``);
    }

    // 2) Ancienne colonne countryCode → countryId
    const rechargesHaveCode = await this.columnExists(q, 'sms_recharges', 'countryCode');
    if (rechargesHaveCode) {
      await q.query(
        "UPDATE `sms_recharges` r JOIN `countries` c ON UPPER(TRIM(c.`code`)) = UPPER(TRIM(r.`countryCode`)) " +
          "SET r.`countryId` = c.`id` WHERE r.`countryId` IS NULL AND r.`countryCode` IS NOT NULL AND r.`countryCode` <> ''",
      );
    }
    if (hasLogs && (await this.columnExists(q, 'sms_logs', 'countryCode'))) {
      await q.query(
        "UPDATE `sms_logs` l JOIN `countries` c ON UPPER(TRIM(c.`code`)) = UPPER(TRIM(l.`countryCode`)) " +
          "SET l.`countryId` = c.`id` WHERE l.`countryId` IS NULL AND l.`countryCode` IS NOT NULL AND l.`countryCode` <> ''",
      );
      await q.query('ALTER TABLE `sms_logs` DROP COLUMN `countryCode`');
    }
    if (await this.indexExists(q, 'sms_recharges', this.IDX, 'countryCode')) {
      await q.query(`ALTER TABLE \`sms_recharges\` DROP INDEX \`${this.IDX}\``);
    }
    if (rechargesHaveCode) {
      const [{ n }] = await q.query(
        "SELECT COUNT(*) AS n FROM `sms_recharges` WHERE `countryId` IS NULL AND `countryCode` IS NOT NULL AND `countryCode` <> ''",
      );
      if (Number(n) === 0) {
        await q.query('ALTER TABLE `sms_recharges` DROP COLUMN `countryCode`');
      } else {
        console.warn(`[SmsQuotaByCountry] ${n} recharge(s) avec un code pays absent de countries : colonne countryCode conservée.`);
      }
    }

    // 3) Index
    if (!(await this.indexExists(q, 'sms_recharges', this.IDX))) {
      await q.query(`ALTER TABLE \`sms_recharges\` ADD INDEX \`${this.IDX}\` (\`category\`, \`countryId\`, \`status\`)`);
    }

    // 4) Clés étrangères
    if (!(await this.fkExists(q, 'sms_recharges', this.FK_RECHARGES))) {
      await q.query(
        `ALTER TABLE \`sms_recharges\` ADD CONSTRAINT \`${this.FK_RECHARGES}\` FOREIGN KEY (\`countryId\`) REFERENCES \`countries\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
      );
    }
    if (hasLogs && !(await this.fkExists(q, 'sms_logs', this.FK_LOGS))) {
      await q.query(
        `ALTER TABLE \`sms_logs\` ADD CONSTRAINT \`${this.FK_LOGS}\` FOREIGN KEY (\`countryId\`) REFERENCES \`countries\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await this.fkExists(q, 'sms_logs', this.FK_LOGS)) {
      await q.query(`ALTER TABLE \`sms_logs\` DROP FOREIGN KEY \`${this.FK_LOGS}\``);
    }
    if (await this.fkExists(q, 'sms_recharges', this.FK_RECHARGES)) {
      await q.query(`ALTER TABLE \`sms_recharges\` DROP FOREIGN KEY \`${this.FK_RECHARGES}\``);
    }
    if (await this.indexExists(q, 'sms_recharges', this.IDX)) {
      await q.query(`ALTER TABLE \`sms_recharges\` DROP INDEX \`${this.IDX}\``);
    }
    // ⚠️ Les recharges par pays deviennent du quota commun après retour arrière
    if (await this.columnExists(q, 'sms_recharges', 'countryId')) {
      await q.query('ALTER TABLE `sms_recharges` DROP COLUMN `countryId`');
    }
    if (await this.columnExists(q, 'sms_logs', 'countryId')) {
      await q.query('ALTER TABLE `sms_logs` DROP COLUMN `countryId`');
    }
  }
}
