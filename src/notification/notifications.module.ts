import { forwardRef, Module } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { RideModule } from 'src/Course et Taxi/Ride/ride.module';
import { DriverLocationModule } from 'src/Course et Taxi/DriverLocation/driver-location.module';
import { NotificationHelper } from './utils/notification.helper';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';
import { UserNotification } from 'src/firebase/entities/user-notification.entity';
import { NotificationsController } from './notifications.controller'; // ✅
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';

@Module({
  imports: [
    forwardRef(() => RideModule),
    TypeOrmModule.forFeature([
      UserEntity,
      DeviceToken,
      UserNotification,
      UserHasCompanyEntity, // ✅ Ajout
      CompanyHasUserResource,
    ]),
    DriverLocationModule,
  ],
  controllers: [NotificationsController], // ✅ plus de DebugController
  providers: [NotificationsGateway, NotificationsService, NotificationHelper],
  exports: [NotificationsService, NotificationHelper, TypeOrmModule],
})
export class NotificationsModule {}
