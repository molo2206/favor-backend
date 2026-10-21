import { Module } from '@nestjs/common';
import { FleetModule } from './fleet/fleet.module';
import { InternalTransferModule } from './internal-transfers/internal-transfer.module';

/** BackOffice — Logistique interne + charroi */
@Module({
  imports: [FleetModule, InternalTransferModule],
  exports: [FleetModule, InternalTransferModule],
})
export class LogisticsModule { }
