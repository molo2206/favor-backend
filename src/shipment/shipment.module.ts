// shipment.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt'; // ✅ AJOUTER
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
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { InvoiceService } from 'src/order/invoice/invoice.util';
import { MailModule } from 'src/email/email.module';
import { UserEntity } from 'src/users/entities/user.entity';
import { OperationEntity } from 'src/operation/entity/operation.entity';
import { PawapayModule } from 'src/pawapay/pawapay.module';
import { OtpEntity } from 'src/otp/entities/otp.entity';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { NotificationsModule } from 'src/notification/notifications.module';
import { FilesService } from 'src/files/files.service';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { Resource } from 'src/ressource/entity/resource.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { FcmService } from 'src/notification/fcm.service';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';
import { UserSettingsEntity } from 'src/users/entities/user-settings.entity';
import { UserLoyaltyEntity } from 'src/users/entities/user-loyalty.entity';
import { UserLoyaltyHistoryEntity } from 'src/users/entities/user-loyalty-history.entity';
import { CompanySettingsEntity } from 'src/company/entities/company-settings.entity';
import { FpayModule } from 'src/fpay/fpay.module'; // ✅ CHANGER: importer FpayModule au lieu de FpayService
import { CompanyEntity } from 'src/company/entities/company.entity';
import { ConfigService } from '@nestjs/config'; // ✅ AJOUTER

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
    // ✅ AJOUTER JwtModule
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('ACCESS_TOKEN_SECRET_KEY'),
        signOptions: { expiresIn: '48h' },
      }),
      inject: [ConfigService],
    }),
    // ✅ IMPORTER FpayModule (au lieu de mettre FpayService dans providers)
    FpayModule,
    TypeOrmModule.forFeature([
      Shipment,
      PackageDetails,
      TypeTransport,
      ShipmentTracking,
      UserEntity,
      OperationEntity,
      OtpEntity,
      UserPlatformRoleEntity,
      UserHasCompanyEntity,
      CompanyHasUserResource,
      Resource,
      BranchEntity,
      DeviceToken,
      UserSettingsEntity,
      UserLoyaltyEntity,
      UserLoyaltyHistoryEntity,
      CompanySettingsEntity,
      CompanyEntity
    ]),
    forwardRef(() => MailModule),
    PawapayModule,
    NotificationsModule,
  ],
  controllers: [
    ShipmentController,
    TypeTransportController,
    ShipmentTrackingController,
  ],
  providers: [
    ShipmentService,
    TypeTransportService,
    ShipmentTrackingService,
    CloudinaryService,
    SmsHelper,
    InvoiceService,
    FilesService,
    PermissionHelper,
    FcmService,
    PushNotificationHelper,
    // ❌ SUPPRIMER FpayService d'ici - il est fourni par FpayModule
  ],
  exports: [ShipmentService, TypeTransportService, ShipmentTrackingService],
})
export class ShipmentModule { }