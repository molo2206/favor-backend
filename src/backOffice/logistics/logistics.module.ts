import { Module } from '@nestjs/common';
import { FleetModule } from './fleet/fleet.module';
import { AssetModule } from './assets/asset.module';

/**
 * BackOffice — Logistique interne (biens de l'entreprise) + charroi (véhicules).
 * Aucune relation avec les colis.
 */
@Module({
  imports: [FleetModule, AssetModule],
  exports: [FleetModule, AssetModule],
})
export class LogisticsModule { }
