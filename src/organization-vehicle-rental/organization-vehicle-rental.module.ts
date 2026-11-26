import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationVehicleRentalService } from './organization-vehicle-rental.service';
import { OrganizationVehicleRentalController } from './organization-vehicle-rental.controller';
import { OrganizationVehicleRental } from './entities/organization-vehicle-rental.entity';
import { OrganizationRentalPayment } from './entities/organization-rental-payment.entity';
import { Product } from 'src/products/entities/product.entity';
import { VehicleTechnicalControlModule } from 'src/vehicle-technical-control/vehicle-technical-control.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationVehicleRental,
      OrganizationRentalPayment,
      Product,
    ]),
    VehicleTechnicalControlModule, // fournit VehicleTechnicalControlService (gate contrôle technique)
  ],
  controllers: [OrganizationVehicleRentalController],
  providers: [OrganizationVehicleRentalService],
  exports: [OrganizationVehicleRentalService],
})
export class OrganizationVehicleRentalModule {}
