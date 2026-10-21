import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { ShipmentTracking } from 'src/shipment/entity/shipment_tracking.entity';
import { BranchStockModule } from 'src/branch-stock/branch-stock.module';
import { BranchParcelStock } from 'src/branch-stock/entities/branch-parcel-stock.entity';
import { SupplyCoreModule } from 'src/supply/supply-core.module';
import { FleetModule } from '../fleet/fleet.module';
import { InternalTransfer } from './entities/internal-transfer.entity';
import { InternalTransferItem } from './entities/internal-transfer-item.entity';
import { InternalTransferService } from './internal-transfer.service';
import { InternalTransferController } from './internal-transfer.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InternalTransfer,
      InternalTransferItem,
      BranchEntity,
      Shipment,
      ShipmentTracking,
      BranchParcelStock,
    ]),
    BranchStockModule,
    SupplyCoreModule,
    FleetModule,
  ],
  controllers: [InternalTransferController],
  providers: [InternalTransferService],
  exports: [InternalTransferService],
})
export class InternalTransferModule { }
