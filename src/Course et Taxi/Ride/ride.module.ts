import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RideService } from './ride.service';
import { RideController } from './ride.controller';
import { Ride } from './entity/Ride.entity';
import { RideEvent } from './entity/RideEvent.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { City } from 'src/company/entities/city.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { NotificationsModule } from 'src/notification/notifications.module';
import { DriverLocationModule } from '../DriverLocation/driver-location.module';
import { I18nModule } from 'src/libs/common/src';
import { Pricing } from '../Pricing/entity/Pricing.entity';
import { DriverVehicle } from '../DriverVehicle/entity/DriverVehicle.entity';
// ✅ AJOUT : temps réel (WebSocket principal + Firebase), recherche de chauffeur, historique
import { RideRealtimeService } from './ride-realtime.service';
import { RideDispatchService } from './ride-dispatch.service';
import { RideHistoryService } from './ride-history.service';
import { RideGateway } from './ride.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, RideEvent, UserEntity, City, CategoryEntity, Pricing, DriverVehicle]),

    // Utiliser forwardRef pour casser la circular dependency
    // (fournit NotificationsGateway, NotificationsService, FcmService, PresenceService, WsAuthHelper)
    forwardRef(() => NotificationsModule),
    DriverLocationModule,
    I18nModule
  ],
  controllers: [RideController],
  providers: [RideService, RideRealtimeService, RideDispatchService, RideHistoryService, RideGateway],
  exports: [RideService, RideRealtimeService],
})
export class RideModule {}
