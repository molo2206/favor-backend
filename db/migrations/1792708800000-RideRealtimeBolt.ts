import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Courses taxi (type Bolt) : cycle complet, dispatch, notes et historique (ride_events).
 * Idempotente. Script SQL équivalent : db/sql/courses_taxi_temps_reel.sql
 */
const RIDE_COLUMNS: [string, string][] = [
  ['vehicleId', 'varchar(36) NULL DEFAULT NULL'],
  ['paymentMethod', "varchar(20) NULL DEFAULT 'CASH'"],
  ['currency', 'varchar(10) NULL DEFAULT NULL'],
  ['finalPrice', 'decimal(10,2) NULL DEFAULT NULL'],
  ['commissionAmount', 'decimal(10,2) NULL DEFAULT NULL'],
  ['driverEarning', 'decimal(10,2) NULL DEFAULT NULL'],
  ['dispatchRound', 'int NOT NULL DEFAULT 0'],
  ['lastDispatchAt', 'datetime(6) NULL DEFAULT NULL'],
  ['notifiedDriverIds', 'json NULL'],
  ['rejectedDriverIds', 'json NULL'],
  ['acceptedAt', 'datetime(6) NULL DEFAULT NULL'],
  ['arrivedAt', 'datetime(6) NULL DEFAULT NULL'],
  ['startedAt', 'datetime(6) NULL DEFAULT NULL'],
  ['completedAt', 'datetime(6) NULL DEFAULT NULL'],
  ['cancelledAt', 'datetime(6) NULL DEFAULT NULL'],
  ['driverRating', 'tinyint NULL DEFAULT NULL'],
  ['driverRatingComment', 'varchar(500) NULL DEFAULT NULL'],
  ['riderRating', 'tinyint NULL DEFAULT NULL'],
  ['riderRatingComment', 'varchar(500) NULL DEFAULT NULL'],
];

const INDEXES: [string, string, string][] = [
  ['rides', 'idx_rides_status_dispatch', 'status,lastDispatchAt'],
  ['rides', 'idx_rides_driver_status', 'driverId,status'],
  ['rides', 'idx_rides_rider_status', 'riderId,status'],
  ['driver_locations', 'idx_driver_locations_dispatch', 'isOnline,isBusy,updatedAt'],
  ['driver_vehicles', 'idx_driver_vehicles_active_cat', 'driverId,isActive,categoryId'],
];

export class RideRealtimeBolt1792708800000 implements MigrationInterface {
  name = 'RideRealtimeBolt1792708800000';

  private async tableExists(q: QueryRunner, t: string) {
    const r = await q.query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1', [t]);
    return r.length > 0;
  }

  private async column(q: QueryRunner, t: string, c: string) {
    const r = await q.query(
      'SELECT COLUMN_TYPE AS type, CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll, IS_NULLABLE AS nullable ' +
        'FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
      [t, c],
    );
    return r[0] as { type: string; cs: string | null; coll: string | null; nullable: string } | undefined;
  }

  private async indexExists(q: QueryRunner, t: string, i: string) {
    const r = await q.query('SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1', [t, i]);
    return r.length > 0;
  }

  private async fkExists(q: QueryRunner, t: string, fk: string) {
    const r = await q.query(
      "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1",
      [t, fk],
    );
    return r.length > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    if (await this.tableExists(q, 'rides')) {
      for (const [col, def] of RIDE_COLUMNS) {
        if (!(await this.column(q, 'rides', col))) await q.query(`ALTER TABLE \`rides\` ADD COLUMN \`${col}\` ${def}`);
      }
    }
    for (const [t, name, cols] of INDEXES) {
      if (!(await this.tableExists(q, t)) || (await this.indexExists(q, t, name))) continue;
      const list = cols.split(',').map((c) => `\`${c}\``).join(', ');
      await q.query(`ALTER TABLE \`${t}\` ADD INDEX \`${name}\` (${list})`);
    }

    const ref = await q.query(
      'SELECT t.TABLE_COLLATION AS coll, c.CHARACTER_SET_NAME AS cs FROM information_schema.TABLES t ' +
        'JOIN information_schema.COLLATION_CHARACTER_SET_APPLICABILITY c ON c.COLLATION_NAME = t.TABLE_COLLATION ' +
        "WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = 'rides' LIMIT 1",
    );
    const cs = ref[0]?.cs || 'utf8mb4';
    const coll = ref[0]?.coll || 'utf8mb4_unicode_ci';

    await q.query(`CREATE TABLE IF NOT EXISTS \`ride_events\` (
      \`id\` varchar(36) NOT NULL,
      \`rideId\` varchar(36) NOT NULL,
      \`type\` varchar(40) NOT NULL,
      \`fromStatus\` varchar(30) NULL DEFAULT NULL,
      \`toStatus\` varchar(30) NULL DEFAULT NULL,
      \`actorId\` varchar(36) NULL DEFAULT NULL,
      \`actorRole\` varchar(10) NULL DEFAULT NULL,
      \`lat\` decimal(10,7) NULL DEFAULT NULL,
      \`lng\` decimal(10,7) NULL DEFAULT NULL,
      \`payload\` json NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      INDEX \`idx_ride_events_ride_date\` (\`rideId\`, \`createdAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=${cs} COLLATE=${coll}`);

    if ((await this.tableExists(q, 'rides')) && !(await this.fkExists(q, 'ride_events', 'fk_ride_events_ride'))) {
      const target = await this.column(q, 'rides', 'id');
      const current = await this.column(q, 'ride_events', 'rideId');
      if (target && current) {
        if (current.type !== target.type || (current.coll || '') !== (target.coll || '')) {
          const charset = target.cs ? ` CHARACTER SET ${target.cs} COLLATE ${target.coll}` : '';
          await q.query(`ALTER TABLE \`ride_events\` MODIFY \`rideId\` ${target.type}${charset} NOT NULL`);
        }
        await q.query(
          'ALTER TABLE `ride_events` ADD CONSTRAINT `fk_ride_events_ride` FOREIGN KEY (`rideId`) REFERENCES `rides` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
        );
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await this.tableExists(q, 'ride_events')) await q.query('DROP TABLE `ride_events`');
    for (const [t, name] of INDEXES) {
      if ((await this.tableExists(q, t)) && (await this.indexExists(q, t, name))) {
        await q.query(`ALTER TABLE \`${t}\` DROP INDEX \`${name}\``);
      }
    }
    for (const [col] of [...RIDE_COLUMNS].reverse()) {
      if (await this.column(q, 'rides', col)) await q.query(`ALTER TABLE \`rides\` DROP COLUMN \`${col}\``);
    }
  }
}
