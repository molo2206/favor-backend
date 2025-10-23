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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product, // ✅ ProductRepository
      CompanyEntity, // ✅ CompanyEntityRepository  
      CategoryEntity, // ✅ CategoryEntityRepository
      ImageProductEntity, // ✅ ImageProductEntityRepository
      Service, // ✅ ServiceRepository
      MeasureEntity, // ✅ MeasureEntityRepository
      OrderItemEntity, // ✅ OrderItemEntityRepository
      Wishlist, // ✅ WishlistRepository
      Specification, // ✅ SpecificationRepository
      Attribute, // ✅ AttributeRepository
      ProductAttribute, // ✅ ProductAttributeRepository
      ProductVariation, // ✅ ProductVariationRepository
      VariationAttributeValue, // ✅ VariationAttributeValueRepository
      TauxCompany, // ✅ Pour les relations
    ]),
    ProductSpecificationValueModule,
    CloudinaryModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, MeasureService],
  exports: [ProductService], // ✅ Ajouter l'export si utilisé ailleurs
})
export class ProductModule {}