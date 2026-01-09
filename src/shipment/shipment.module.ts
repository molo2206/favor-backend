import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShipmentService } from './shipment.service';
import { ShipmentController } from './shipment.controller';
import { TypeTransportService } from './type-transport.service';
import { TypeTransportController } from './type-transport.controller';
import { Shipment } from './entity/shipment.entity';
import { PackageDetails } from './entity/package-details.entity';
import { TypeTransport } from './entity/type-transport.entity';
import { ShipmentTrackingService } from './shipment-tracking.service';
import { ShipmentTrackingController } from './shipment-tracking.controller';
import { ShipmentTracking } from './entity/shipment_tracking.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shipment, PackageDetails, TypeTransport, ShipmentTracking]),
  ],
  controllers: [ShipmentController, TypeTransportController, ShipmentTrackingController],
  providers: [ShipmentService, TypeTransportService, ShipmentTrackingService,CloudinaryService],
  exports: [ShipmentService, TypeTransportService, ShipmentTrackingService],
})
export class ShipmentModule {}
