import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ✅ Véhicules des chauffeurs : marque (facultative).
 *    Script SQL équivalent : db/sql/chauffeurs_marque_vehicule.sql
 */
export class DriverVehicleBrand1796515200000 implements MigrationInterface {
  name = 'DriverVehicleBrand1796515200000';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasColumn('driver_vehicles', 'brand'))) {
      await q.query('ALTER TABLE `driver_vehicles` ADD COLUMN `brand` varchar(100) NULL AFTER `categoryId`');
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `driver_vehicles` DROP COLUMN `brand`');
  }
}
