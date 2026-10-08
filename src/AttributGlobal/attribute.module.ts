import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttributeService } from './attribute.service';
import { AttributeController } from './attribute.controller';
import { Attribute } from './entities/attributes.entity';
import { AttributeValue } from './entities/attribute_values.entity';
import { ProductAttribute } from './entities/product_attributes.entity';
import { CategoryAttribute } from './entities/category_attributes.entity';
import { VariationAttributeValue } from './entities/variation_attribute_values.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Attribute,
      AttributeValue,
      ProductAttribute,
      CategoryAttribute,
      VariationAttributeValue,
    ]),
  ],
  controllers: [AttributeController],
  providers: [AttributeService],
  exports: [AttributeService, TypeOrmModule],
})
export class AttributeModule {}