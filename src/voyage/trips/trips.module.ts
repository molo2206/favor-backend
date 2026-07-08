// trips.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { Trip } from './entities/trip.entity';
import { TripSegment } from './entities/trip-segment.entity';
import { VehicleSchedule } from '../vehicles/entities/vehicle-schedule.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { VehicleSeat } from '../seats/entities/seat.entity';
import { ReservationVehicule } from '../reservations-vehicles/entities/reservations-vehicle.entity';
import { ReservationSegment } from '../reservations-vehicles/entities/reservation-segment.entity';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { NotificationHelper } from 'src/notification/utils/notification.helper';
import { NotificationsModule } from 'src/notification/notifications.module';
import { MailModule } from 'src/email/email.module';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { OperationEntity } from 'src/operation/entity/operation.entity';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';
import { UserSettingsEntity } from 'src/users/entities/user-settings.entity';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';
import { NotificationsService } from 'src/notification/notifications.service';
import { NotificationsGateway } from 'src/notification/notifications.gateway';
import { FcmService } from 'src/notification/fcm.service';
import { PawapayModule } from 'src/pawapay/pawapay.module';
import { RideModule } from 'src/Course/Ride/ride.module';
import { DriverLocationModule } from 'src/Course/DriverLocation/driver-location.module';
import { MailOrderService } from 'src/email/emailorder.service';
import { Meal } from '../meal/entity/meal.entity';
import { VehicleBaggageRule } from '../baggage-rules/entities/baggage-rule.entity';
import { CommonModule } from 'src/libs/common/src/common.module'; // ✅ chemin correct

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Trip,
      TripSegment,
      VehicleSchedule,
      Vehicle,
      VehicleSeat,
      ReservationVehicule,
      ReservationSegment,
      UserEntity,
      CompanyEntity,
      UserHasCompanyEntity,
      OperationEntity,
      DeviceToken,
      UserSettingsEntity,
      UserPlatformRoleEntity,
      CompanyHasUserResource,
      Meal,
      VehicleBaggageRule
    ]),
    CommonModule, // ✅ pour avoir I18nService
    forwardRef(() => NotificationsModule),
    forwardRef(() => MailModule),
    forwardRef(() => PawapayModule),
    forwardRef(() => RideModule),
    forwardRef(() => DriverLocationModule),
  ],
  providers: [
    TripsService,
    SmsHelper,
    PushNotificationHelper,
    NotificationHelper,
    PermissionHelper,
    MailOrderService,
    NotificationsService,
    NotificationsGateway,
    FcmService,
  ],
  controllers: [TripsController],
  exports: [
    TripsService,
    PushNotificationHelper,
    NotificationHelper,
    PermissionHelper,
    NotificationsService,
  ],
})
export class TripsModule {}