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
import { ParcelTransfer } from './entities/parcel-transfer.entity';
import { ParcelTransferItem } from './entities/parcel-transfer-item.entity';
import { ParcelCheckin } from './entities/parcel-checkin.entity';
import { ParcelCheckinItem } from './entities/parcel-checkin-item.entity';
import { ParcelTransferService } from './parcel-transfer.service';
import { ParcelTransferController } from './parcel-transfer.controller';

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
      // ✅ Transferts entre branches + pointage à l'arrivée
      ParcelTransfer,
      ParcelTransferItem,
      ParcelCheckin,
      ParcelCheckinItem,
    ]),
    SupplyCoreModule, // historique Supply
  ],
  // ⚠️ ParcelTransferController AVANT BranchStockController : « GET /branch-stock/:stockId »
  //    ne doit pas capter « /branch-stock/transfers » ni « /branch-stock/checkins »
  controllers: [ParcelTransferController, BranchStockController],
  providers: [BranchStockService, ParcelTransferService],
  exports: [BranchStockService, ParcelTransferService],
})
export class BranchStockModule { }
