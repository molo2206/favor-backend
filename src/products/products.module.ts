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
import { AttributeValue } from 'src/Attribut/entities/attribute_values.entity';
import { Sku } from 'src/Attribut/entities/skus.entity';
import { ProductAttribute } from 'src/Attribut/entities/product_attributes.entity';
import { Specification } from 'src/specification/entities/Specification.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product, // 👈 Requis pour @InjectRepository(Product)
      CompanyEntity, // 👈 Requis pour @InjectRepository(CompanyEntity)
      CategoryEntity, // 👈 Requis pour @InjectRepository(CategoryEntity)
      ImageProductEntity,
      MeasureEntity,
      TauxCompany,
      OrderItemEntity,
      Wishlist,
      Service,
      ProductAttribute, // <-- ajoute ici
      AttributeValue,
      Sku,
      Specification
    ]),
    ProductSpecificationValueModule,
    CloudinaryModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, MeasureService],
})
export class ProductModule {}
