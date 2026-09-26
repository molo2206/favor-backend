// order.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from '../order-item/entities/order-item.entity';
import { SubOrderEntity } from '../sub-order/entities/sub-order.entity';
import { AddressUser } from '../address-user/entities/address-user.entity';
import { AddressUserModule } from '../address-user/address-user.module';
import { SubOrderItemEntity } from 'src/sub-order-item/entities/sub-order-item.entity';
import { Product } from 'src/products/entities/product.entity';
import { OrderController } from './order.controller';
import { MailModule } from 'src/email/email.module';
import { PdfModule } from 'src/pdf/pdf.module';
import { TransactionModule } from 'src/transaction/transaction.module';
import { InvoiceModule } from './invoice/invoice.module';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { NotificationsModule } from 'src/notification/notifications.module';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { PawapayModule } from 'src/pawapay/pawapay.module';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { OrderNotificationHelper } from 'src/notification/utils/order-notification.helper';
import { OperationEntity } from 'src/operation/entity/operation.entity';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { NotificationHelper } from 'src/notification/utils/notification.helper';
import { FcmService } from 'src/notification/fcm.service'; // ✅ ajout
import { UserSettingsEntity } from 'src/users/entities/user-settings.entity';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';
import { I18nService } from 'src/libs/common/src';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { City } from 'src/company/entities/city.entity';
import { FpayModule } from 'src/fpay/fpay.module';
import { ReferralEntity } from 'src/users/entities/referral.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      SubOrderEntity,
      SubOrderItemEntity,
      Product,
      AddressUser,
      UserPlatformRoleEntity,
      UserEntity,
      CompanyEntity,
      UserHasCompanyEntity,
      OperationEntity,
      DeviceToken,
      UserSettingsEntity,
      BranchEntity,
      CompanyHasUserResource,
      City,
      ReferralEntity
    ]),
    PawapayModule,
    AddressUserModule,
    MailModule,
    InvoiceModule,
    PdfModule,
    TransactionModule,
    NotificationsModule,
    FpayModule
  ],
  providers: [
    OrderService,
    SmsHelper,
    OrderNotificationHelper,
    NotificationHelper,
    FcmService, // ✅ ajout
    PushNotificationHelper, // ✅ ajout
    PermissionHelper,
    I18nService,
  ],
  controllers: [OrderController],
  exports: [PushNotificationHelper],
})
export class OrderModule {}
