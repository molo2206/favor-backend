import { Module } from '@nestjs/common';
import { ProductController } from './products.controller';
import { ProductService } from './products.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { CloudinaryModule } from 'src/users/utility/helpers/cloudinary.module';
import { ImageProductEntity } from './entities/imageProduct.entity';
import { MeasureService } from 'src/measure/measure.service';
import { MeasureEntity } from 'src/measure/entities/measure.entity';
import { TauxCompany } from 'src/taux-company/entities/taux-company.entity';
import { OrderItemEntity } from 'src/order-item/entities/order-item.entity';
import { ProductSpecificationValueModule } from 'src/specification/product-specification.module';
import { Wishlist } from './entities/wishlists.entity';
import { Service } from 'src/service/entities/service.entity';
import { Specification } from 'src/specification/entities/Specification.entity';
import { Attribute } from 'src/AttributGlobal/entities/attributes.entity';
import { ProductAttribute } from 'src/AttributGlobal/entities/product_attributes.entity';
import { ProductVariation } from 'src/AttributGlobal/entities/product_variations.entity';
import { VariationAttributeValue } from 'src/AttributGlobal/entities/variation_attribute_values.entity';
import { Brand } from './entities/brand.entity';
import { NotificationsModule } from 'src/notification/notifications.module';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { OrderEntity } from 'src/order/entities/order.entity';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import { FilesService } from 'src/files/files.service';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { UserHasResourceEntity } from 'src/users/entities/user-has-resource.entity';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      CompanyEntity,
      CategoryEntity,
      ImageProductEntity,
      Service,
      MeasureEntity,
      OrderItemEntity,
      Wishlist,
      Specification,
      Attribute,
      ProductAttribute,
      ProductVariation,
      VariationAttributeValue,
      TauxCompany,
      Brand,
      UserPlatformRoleEntity,
      UserEntity,
      OrderEntity,
      SubOrderEntity,
      UserHasCompanyEntity,
      CompanyHasUserResource,
      UserHasResourceEntity,
    ]),
    ProductSpecificationValueModule,
    CloudinaryModule,
    NotificationsModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, MeasureService, FilesService, PermissionHelper],
  exports: [ProductService],
})
export class ProductModule {}
