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
      UserPlatformRoleEntity, // ✅ Ajout pour injection dans ProductService
      UserEntity
    ]),
    ProductSpecificationValueModule,
    CloudinaryModule,
    NotificationsModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, MeasureService],
  exports: [ProductService],
})
export class ProductModule {}
