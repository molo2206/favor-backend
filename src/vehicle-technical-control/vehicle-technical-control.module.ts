import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleTechnicalControlService } from './vehicle-technical-control.service';
import { VehicleTechnicalControlController } from './vehicle-technical-control.controller';
import { VehicleTechnicalControl } from './entities/vehicle-technical-control.entity';
import { TechnicalControlPayment } from './entities/technical-control-payment.entity';
import { TechnicalControlTariff } from './entities/technical-control-tariff.entity';
import { Product } from 'src/products/entities/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VehicleTechnicalControl,
      TechnicalControlPayment,
      TechnicalControlTariff,
      Product,
    ]),
  ],
  controllers: [VehicleTechnicalControlController],
  providers: [VehicleTechnicalControlService],
  exports: [VehicleTechnicalControlService],
})
export class VehicleTechnicalControlModule {}
