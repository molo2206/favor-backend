import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from 'src/order/entities/order.entity';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { PackageDetails } from 'src/shipment/entity/package-details.entity';
import { ShipmentTracking } from 'src/shipment/entity/shipment_tracking.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { LtaShipmentEntity } from 'src/shipment/Lta/entity/lta-shipment.entity';
import { BranchParcelStock } from 'src/branch-stock/entities/branch-parcel-stock.entity';
import { Supply } from './entities/supply.entity';
import { SupplyHistory } from './entities/supply-history.entity';
import { SupplyCoreModule } from './supply-core.module';
import { SupplyService } from './supply.service';
import { SupplyController } from './supply.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supply,
      SupplyHistory,
      OrderEntity,
      SubOrderEntity,
      BranchEntity,
      CompanyEntity,
      Shipment,
      PackageDetails,
      ShipmentTracking,
      LtaEntity,
      LtaShipmentEntity,
      BranchParcelStock,
    ]),
    SupplyCoreModule,
  ],
  controllers: [SupplyController],
  providers: [SupplyService],
  exports: [SupplyService, SupplyCoreModule],
})
export class SupplyModule { }
