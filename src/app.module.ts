import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CurrentUserMiddleware } from './users/utility/middlewares/current-user.middleware';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from 'db/data-source';
import { UsersModule } from './users/users.module';
import { OtpModule } from './otp/otp.module';
import { CompanyModule } from './company/company.module';
import { UserHasCompanyModule } from './user_has_company/user_has_company.module';
import { TypeCompanyModule } from './type_company/type_company.module';
import { CategoryModule } from './category/category.module';
import { ProductModule } from './products/products.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudinaryModule } from './users/utility/helpers/cloudinary.module';
import { DeliveryModule } from './delivery/delivery.module';
import { SignatureModule } from './signature/signature.module';
import { TrackingModule } from './tracking/tracking.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { join } from 'path';
import { TravelReservationModule } from './travel_reservation/travel_reservation.module';
import { MeasureModule } from './measure/measure.module';
import { EventsModule } from './events/events.module';
import { AddressUserModule } from './address-user/address-user.module';
import { OrderModule } from './order/order.module';
import { OrderItemModule } from './order-item/order-item.module';
import { SubOrderModule } from './sub-order/sub-order.module';
import { SubOrderItemModule } from './sub-order-item/sub-order-item.module';
import { ServiceModule } from './service/service.module';
import { RoomImageModule } from './room-image/room-image.module';
import { RoomModule } from './room/room.module';
import { BookingModule } from './booking/booking.module';
import { TauxCompanyModule } from './taux-company/taux-company.module';
import { AppSettingModule } from './app-setting/app-setting.module';
import { RoleModule } from './users/role.module';
import { PlatformModule } from './users/platform.module';
import { UserPlatformRoleModule } from './users/user-platform-role.module';
import { SpecificationModule } from './specification/specification.module';
import { CategorySpecificationModule } from './specification/category-specification.module';
import { ProductSpecificationValueModule } from './specification/product-specification.module';
import { SmsHelper } from './users/utility/helpers/sms.helper';
import { AttributeModule } from './AttributGlobal/attribute.module';
import { OpenaiModule } from './open-ai/openai.module';
import { ResourceModule } from './ressource/resource.module';
import { BranchModule } from './branch/branch.module';
import { RoomAvailabilityModule } from './HotelRoomAvailability/hotelRoomAvailability.module';
import { BackupModule } from './backup/backup.module';
import { ColisModule } from './logistique/colis.module';
import { ShipmentModule } from './shipment/shipment.module';
import { LtaModule } from './shipment/Lta/lta.module';
import { PawapayModule } from './pawapay/pawapay.module';
import { OperationModule } from './operation/operation.module';
import { AuditModule } from './audit/audit.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit/interceptor/audit.interceptor';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { GoogleModule } from './Course/google-maps/google-maps.module';
import { ServiceZonesModule } from './Course/ServiceZone/service-zones.module';
import { DriverVehicleModule } from './Course/DriverVehicle/driver-vehicle.module';
import { PricingModule } from './Course/Pricing/pricing.module';
import { DriverLocationModule } from './Course/DriverLocation/driver-location.module';
import { RideModule } from './Course/Ride/ride.module';
import { ImageModule } from './imagesTraitement/images.module';
import { FilesModule } from './files/files.module';
import { NotificationsModule } from './notification/notifications.module';
import { DeviceToken } from './firebase/entities/device-token.entity';
import { UserNotification } from './firebase/entities/user-notification.entity';
import { FcmService } from './notification/fcm.service';
import { VehiclesModule } from './voyage/vehicles/vehicles.module';
import { TripsModule } from './voyage/trips/trips.module';
import { SeatsModule } from './voyage/seats/seats.module';
import { BaggageModule } from './voyage/baggage/baggage.module';
import { BaggageRulesModule } from './voyage/baggage-rules/baggage-rules.module';
import { ReservationsVehiclesModule } from './voyage/reservations-vehicles/reservations-vehicles.module';
import { PaymentResTravelModule } from './voyage/payment_res_travel/payment_res_travel.module';
import { CompanyHasResourceModule } from './company_has_usrResource/company_has_resource.module';
import { FilesService } from './files/files.service';
import { CommonModule } from './libs/common/src/common.module';
import { CompanyTariffModule } from './company_tariff/company-tariff.module';
import { PushNotificationCronModule } from './cron/push-notification-cron.module';
import { CronModule } from './cron/cron.module';
import { MealsModule } from './voyage/meal/meals.module';
import { ScheduleModule } from '@nestjs/schedule';
import { I18nModule } from './libs/common/src';
import { FpayModule } from './fpay/fpay.module';
// import { WhatsAppModule } from './users/utility/helpers/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      ...dataSourceOptions,
      extra: {
        charset: 'utf8mb4',
      },
    }),
    // Enregistrement des entités Firebase
    TypeOrmModule.forFeature([DeviceToken, UserNotification]),
    CacheModule.register({
      store: redisStore,
      host: 'localhost',
      port: 6379,
      ttl: 0,
      isGlobal: true,
    }),
    HttpModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('MAILER_HOST'),
          port: parseInt(configService.get<string>('MAILER_PORT') ?? '587', 10),
          secure: false,
          auth: {
            user: configService.get<string>('MAILER_USER'),
            pass: configService.get<string>('MAILER_PASS'),
          },
        },
        defaults: {
          from: `"FavorHelp" <favorhelp31@gmail.com>`,
        },
        template: {
          dir: join(__dirname, 'templates'),
          options: {
            strict: true,
          },
        },
      }),
    }),
    CommonModule,
    UsersModule,
    TauxCompanyModule,
    OtpModule,
    CompanyModule,
    UserHasCompanyModule,
    TypeCompanyModule,
    CategoryModule,
    ProductModule,
    CloudinaryModule,
    DeliveryModule,
    SignatureModule,
    TrackingModule,
    TravelReservationModule,
    MeasureModule,
    EventsModule,
    AddressUserModule,
    OrderModule,
    OrderItemModule,
    SubOrderModule,
    SubOrderItemModule,
    ServiceModule,
    RoomImageModule,
    RoomModule,
    BookingModule,
    TauxCompanyModule,
    AppSettingModule,
    RoleModule,
    PlatformModule,
    UserPlatformRoleModule,
    SpecificationModule,
    CategorySpecificationModule,
    ProductSpecificationValueModule,
    AttributeModule,
    OpenaiModule,
    ResourceModule,
    BranchModule,
    RoomAvailabilityModule,
    BackupModule,
    ColisModule,
    ShipmentModule,
    LtaModule,
    PawapayModule,
    OperationModule,
    AuditModule,
    GoogleModule,
    ServiceZonesModule,
    DriverVehicleModule,
    DriverLocationModule,
    PricingModule,
    RideModule,
    ImageModule,
    FilesModule,
    NotificationsModule,
    VehiclesModule,
    TripsModule,
    ReservationsVehiclesModule,
    SeatsModule,
    BaggageModule,
    BaggageRulesModule,
    PaymentResTravelModule,
    CompanyHasResourceModule,
    CompanyTariffModule,
    PushNotificationCronModule,
    CronModule,
    MealsModule,
    I18nModule,
    CommonModule,
    FpayModule,
    // WhatsAppModule
  ],
  controllers: [AppController],
  exports: [FilesService],
  providers: [
    AppService,
    SmsHelper,
    FilesService,
    FcmService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CurrentUserMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
