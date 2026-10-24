import { Module } from '@nestjs/common';
import { FleetModule } from './fleet/fleet.module';
import { AssetModule } from './assets/asset.module';
import { MaterialRequestModule } from './requests/material-request.module';

/**
 * BackOffice — Logistique interne (biens de l'entreprise : entrées, sorties partielles,
 * demandes de matériel) + charroi (tout le matériel roulant).
 * Aucune relation avec les colis.
 */
@Module({
  imports: [FleetModule, AssetModule, MaterialRequestModule],
  exports: [FleetModule, AssetModule],
})
export class LogisticsModule { }
