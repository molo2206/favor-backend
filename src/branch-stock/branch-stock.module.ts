import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { ShipmentTracking } from 'src/shipment/entity/shipment_tracking.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { LtaShipmentEntity } from 'src/shipment/Lta/entity/lta-shipment.entity';
import { SupplyCoreModule } from 'src/supply/supply-core.module';
import { BranchParcelStock } from './entities/branch-parcel-stock.entity';
import { BranchParcelMovement } from './entities/branch-parcel-movement.entity';
import { BranchStockService } from './branch-stock.service';
import { BranchStockController } from './branch-stock.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BranchParcelStock,
      BranchParcelMovement,
      BranchEntity,
      Shipment,
      ShipmentTracking,
      LtaEntity,
      LtaShipmentEntity,
    ]),
    SupplyCoreModule, // historique Supply
  ],
  controllers: [BranchStockController],
  providers: [BranchStockService],
  exports: [BranchStockService],
})
export class BranchStockModule { }
