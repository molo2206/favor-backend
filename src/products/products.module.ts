import { Module } from '@nestjs/common'; import { ProductController } from './products.controller';
import { ProductService } from './products.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,         // 👈 Requis pour @InjectRepository(Product)
      CompanyEntity,   // 👈 Requis pour @InjectRepository(CompanyEntity)
      CategoryEntity,  // 👈 Requis pour @InjectRepository(CategoryEntity)
    ]),
  ],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule { }
