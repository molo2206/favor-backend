import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LtaService } from './lta.service';
import { LtaController } from './lta.controller';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { LtaEntity } from './entity/lta.entity';
import { LtaShipmentEntity } from './entity/lta-shipment.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { ShipmentTracking } from 'src/shipment/entity/shipment_tracking.entity';
import { ShipmentModule } from '../shipment.module';
import { TrackingltaEntity } from './entity/tracking-lta.entity';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { OperationEntity } from 'src/operation/entity/operation.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { NotificationsModule } from 'src/notification/notifications.module';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { FcmService } from 'src/notification/fcm.service';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';
import { NotificationHelper } from 'src/notification/utils/notification.helper';
import { MailModule } from 'src/email/email.module';
import { UserSettingsEntity } from 'src/users/entities/user-settings.entity'; // ✅ Ajout
import { CompanyTransactionEntity } from 'src/Company-transaction/entity/company-transaction.entity';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LtaEntity,
      CompanyEntity,
      LtaShipmentEntity,
      Shipment,
      ShipmentTracking,
      TrackingltaEntity,
      OperationEntity,
      UserHasCompanyEntity,
      DeviceToken,
      UserSettingsEntity, // ✅ Ajout - nécessaire pour PushNotificationHelper
      CompanyTransactionEntity,
    ]),
    forwardRef(() => ShipmentModule),
    NotificationsModule,
    FirebaseModule,
    MailModule,
  ],
  controllers: [LtaController],
  providers: [
    LtaService,
    SmsHelper,
    PushNotificationHelper,
    NotificationHelper,
    FcmService,
    PermissionHelper
  ],
  exports: [LtaService],
})
export class LtaModule { }
