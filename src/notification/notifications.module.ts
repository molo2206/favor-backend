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
import { NotificationsController } from './notifications.controller';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';

// 🔥 AJOUT IMPORTANT
import { OrderModule } from 'src/order/order.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    forwardRef(() => RideModule),
    forwardRef(() => OrderModule),   // 🔥 AJOUTÉ — pour OrderDeliveryService
    TypeOrmModule.forFeature([
      UserEntity,
      DeviceToken,
      UserNotification,
      UserHasCompanyEntity,
      CompanyHasUserResource,
    ]),
    DriverLocationModule,
    JwtModule.register({                                          // 🔥 AJOUT
      secret: process.env.ACCESS_TOKEN_SECRET_KEY,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsGateway,
    NotificationsService,
    NotificationHelper,
  ],
  exports: [
    NotificationsGateway,
    NotificationsService,
    NotificationHelper,
    TypeOrmModule,
  ],
})
export class NotificationsModule { }