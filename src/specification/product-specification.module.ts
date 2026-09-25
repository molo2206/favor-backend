import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductSpecificationValue } from './entities/ProductSpecificationValue.entity';
import { Product } from 'src/products/entities/product.entity';
import { Specification } from './entities/Specification.entity';
import { ProductSpecificationValueService } from './product-specification.service';
import { ProductSpecificationValueController } from './product-specification.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProductSpecificationValue, Product, Specification])],
  providers: [ProductSpecificationValueService],
  controllers: [ProductSpecificationValueController],
  exports: [ProductSpecificationValueService],
})
export class ProductSpecificationValueModule {}
