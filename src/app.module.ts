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
import { PermissionsModule } from './permissions/permissions.module';
import { UserHasCompanyPermissionsModule } from './user_has_company_permissions/user_has_company_permissions.module';
import { TypeCompanyModule } from './type_company/type_company.module';
import { RoleUserModule } from './role_user/role_user.module';
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
import { TransactionModule } from './transaction/transaction.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
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
          from: `"FavorHelp" <info@cosamed.org>`,
        },
        template: {
          dir: join(__dirname, 'templates'),
          options: {
            strict: true,
          },
        },
      }),
    }),
    UsersModule,
    OtpModule,
    CompanyModule,
    UserHasCompanyModule,
    PermissionsModule,
    UserHasCompanyPermissionsModule,
    TypeCompanyModule,
    RoleUserModule,
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
    TransactionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CurrentUserMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
