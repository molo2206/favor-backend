// src/company/company.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyEntity } from './entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { UserHasCompanyModule } from 'src/user_has_company/user_has_company.module';
import { RoleUser } from 'src/role_user/entities/role_user.entity';
import { TypeCompanyModule } from 'src/type_company/type_company.module';
import { TypeCompany } from 'src/type_company/entities/type_company.entity';
import { CloudinaryModule } from 'src/users/utility/helpers/cloudinary.module';
import { MailModule } from 'src/email/email.module';
import { TauxCompanyModule } from 'src/taux-company/taux-company.module';
import { Product } from 'src/products/entities/product.entity';
import { Service } from 'src/service/entities/service.entity';
import { OrderEntity } from 'src/order/entities/order.entity';
import { Country } from './entities/country.entity';
import { City } from './entities/city.entity';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { NotificationsModule } from 'src/notification/notifications.module';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { OrderItemEntity } from 'src/order-item/entities/order-item.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { CompanyHasResourceEntity } from 'src/company_has_usrResource/entities/company_has_Resource.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { FilesModule } from 'src/files/files.module';
import { Resource } from 'src/ressource/entity/resource.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { CompanyHasPartnerEntity } from './entities/company_has_partner.entity';
import { TripsModule } from '../voyage/trips/trips.module'; // ✅ Import du module qui exporte PushNotificationHelper

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyEntity,
      UserEntity,
      UserHasCompanyEntity,
      RoleUser,
      TypeCompany,
      Product,
      Service,
      OrderEntity,
      Country,
      City,
      UserPlatformRoleEntity,
      CategoryEntity,
      OrderItemEntity,
      CompanyHasUserResource,
      CompanyHasResourceEntity,
      BranchEntity,
      Resource,
      Shipment,
      LtaEntity,
      CompanyHasPartnerEntity,
    ]),
    TauxCompanyModule,
    CloudinaryModule,
    UserHasCompanyModule,
    TypeCompanyModule,
    MailModule,
    NotificationsModule,
    FilesModule,
    forwardRef(() => TripsModule), // ✅ Ajout avec forwardRef pour éviter une éventuelle circularité
  ],
  controllers: [CompanyController],
  providers: [CompanyService, SmsHelper],
})
export class CompanyModule { }