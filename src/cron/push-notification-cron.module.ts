// cron.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushNotificationCronService } from './push-notification-cron.service';
import { DeviceToken } from '../firebase/entities/device-token.entity';
import { Wishlist } from '../products/entities/wishlists.entity';
import { Product } from '../products/entities/product.entity';
import { OrderEntity } from '../order/entities/order.entity';
import { Trip } from '../voyage/trips/entities/trip.entity';
import { UserEntity } from '../users/entities/user.entity';
import { ReservationVehicule } from '../voyage/reservations-vehicles/entities/reservations-vehicle.entity';
import { UserSettingsEntity } from '../users/entities/user-settings.entity';
import { FcmService } from '../notification/fcm.service';
import { SmsHelper } from '../users/utility/helpers/sms.helper';
import { MailOrderService } from '../email/emailorder.service';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { ShipmentTracking } from 'src/shipment/entity/shipment_tracking.entity';
import { PrestataireEntity } from 'src/service/entities/prestataires.entity';
import { Service } from 'src/service/entities/service.entity';
import { RoomAvailability } from 'src/HotelRoomAvailability/entity/RoomAvailability.entity';
import { Reservation } from 'src/HotelRoomAvailability/entity/Reservation.entity';
import { NotificationsModule } from '../notification/notifications.module'; // ✅ IMPORTANT

@Module({
    imports: [
        ScheduleModule.forRoot(),
        TypeOrmModule.forFeature([
            DeviceToken,
            Wishlist,
            Product,
            OrderEntity,
            Trip,
            UserEntity,
            ReservationVehicule,
            UserSettingsEntity,
            LtaEntity,
            Shipment,
            ShipmentTracking,
            PrestataireEntity,
            Service,
            RoomAvailability,
            Reservation,
        ]),
        NotificationsModule,
    ],
    providers: [
        PushNotificationCronService,
        PushNotificationHelper,
        FcmService,
        SmsHelper,
        MailOrderService,
    ],
    exports: [PushNotificationCronService],
})
export class PushNotificationCronModule { }