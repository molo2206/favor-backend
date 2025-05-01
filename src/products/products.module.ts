import { Module } from '@nestjs/common'; import { ProductController } from './products.controller';
import { ProductService } from './products.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { CloudinaryModule } from 'src/users/utility/helpers/cloudinary.module';
import { ImageProductEntity } from './entities/imageProduct.entity';
import { MeasureService } from 'src/measure/measure.service';
import { MeasureEntity } from 'src/measure/entities/measure.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,         // 👈 Requis pour @InjectRepository(Product)
      CompanyEntity,   // 👈 Requis pour @InjectRepository(CompanyEntity)
      CategoryEntity,  // 👈 Requis pour @InjectRepository(CategoryEntity)
      ImageProductEntity,
      MeasureEntity
    ]),
    CloudinaryModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, MeasureService],
})
export class ProductModule { }
