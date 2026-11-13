import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Places du véhicule + passagers, itinéraire modifiable / prolongation des courses,
 *    Supply en plusieurs colis (articles pointés). Script SQL équivalent :
 *    db/sql/courses_itineraire_places_supply_colis.sql
 *    Colonnes ajoutées seulement si absentes ; aucune donnée supprimée.
 */
export class RideRouteSeatsSupplyItems1795046400000 implements MigrationInterface {
  name = 'RideRouteSeatsSupplyItems1795046400000';

  private async addColumn(q: QueryRunner, table: string, column: string, definition: string) {
    if (!(await q.hasColumn(table, column))) {
      await q.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
  }

  public async up(q: QueryRunner): Promise<void> {
    await this.addColumn(q, 'driver_vehicles', 'seats', 'INT NULL DEFAULT NULL');
    await this.addColumn(q, 'rides', 'passengers', 'INT NOT NULL DEFAULT 1');
    await this.addColumn(q, 'rides', 'originalDropoffLocation', 'JSON NULL');
    await this.addColumn(q, 'rides', 'originalPrice', 'DECIMAL(10,2) NULL');
    await this.addColumn(q, 'rides', 'extraPrice', 'DECIMAL(10,2) NULL');
    await this.addColumn(q, 'rides', 'waypoints', 'JSON NULL');
    await this.addColumn(q, 'rides', 'stops', 'JSON NULL');
    await this.addColumn(q, 'rides', 'routeChangesCount', 'INT NOT NULL DEFAULT 0');
    await this.addColumn(q, 'rides', 'routeHistory', 'JSON NULL');
    await q.query('UPDATE `rides` SET `originalDropoffLocation` = `dropoffLocation` WHERE `originalDropoffLocation` IS NULL');
    await q.query('UPDATE `rides` SET `originalPrice` = `price` WHERE `originalPrice` IS NULL AND `price` IS NOT NULL');

    await q.query(`CREATE TABLE IF NOT EXISTS \`supply_shipment_items\` (
  \`id\`             varchar(36)   NOT NULL,
  \`supplyId\`       varchar(36)   NOT NULL,
  \`shipmentId\`     varchar(36)   NOT NULL,
  \`orderItemId\`    varchar(36)   NOT NULL,
  \`itemSource\`     varchar(20)   NOT NULL DEFAULT 'ORDER_ITEM',
  \`productId\`      varchar(36)   NULL,
  \`productName\`    varchar(255)  NULL,
  \`variationLabel\` varchar(500)  NULL,
  \`sku\`            varchar(255)  NULL,
  \`quantity\`       int           NOT NULL,
  \`unitPrice\`      decimal(12,2) NULL,
  \`checkedById\`    varchar(36)   NULL,
  \`checkedAt\`      datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  KEY \`idx_ssi_supply\` (\`supplyId\`),
  KEY \`idx_ssi_shipment\` (\`shipmentId\`),
  KEY \`idx_ssi_item\` (\`orderItemId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `supply_shipment_items`');
    for (const c of ['routeHistory', 'routeChangesCount', 'stops', 'waypoints', 'extraPrice', 'originalPrice', 'originalDropoffLocation', 'passengers']) {
      if (await q.hasColumn('rides', c)) await q.query(`ALTER TABLE \`rides\` DROP COLUMN \`${c}\``);
    }
    if (await q.hasColumn('driver_vehicles', 'seats')) await q.query('ALTER TABLE `driver_vehicles` DROP COLUMN `seats`');
  }
}
