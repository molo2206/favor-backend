import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Un véhicule (et son chauffeur) peut servir dans plusieurs catégories de course (Confort, Familiale…).
 * Nouvelle table driver_vehicle_categories ; driver_vehicles.categoryId reste la catégorie principale.
 * Script SQL équivalent : db/sql/vehicules_multi_categories.sql
 */
export class DriverVehicleCategories1794873600000 implements MigrationInterface {
  name = 'DriverVehicleCategories1794873600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS \`driver_vehicle_categories\` (
  \`vehicleId\` varchar(36) NOT NULL,
  \`categoryId\` varchar(36) NOT NULL,
  \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`vehicleId\`, \`categoryId\`),
  KEY \`idx_dvc_category\` (\`categoryId\`, \`vehicleId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query("ALTER TABLE `driver_vehicle_categories` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    await q.query(
      'INSERT IGNORE INTO `driver_vehicle_categories` (`vehicleId`, `categoryId`, `createdAt`) ' +
        'SELECT `id`, `categoryId`, NOW() FROM `driver_vehicles` WHERE `categoryId` IS NOT NULL',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `driver_vehicle_categories`');
  }
}
