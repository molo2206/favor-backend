import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttributeService } from './attribute.service';
import { AttributeController } from './attribute.controller';
import { Attribute } from './entities/attributes.entity';
import { AttributeValue } from './entities/attribute_values.entity';
import { ProductAttribute } from './entities/product_attributes.entity';
import { CategoryAttribute } from './entities/category_attributes.entity';
import { VariationAttributeValue } from './entities/variation_attribute_values.entity';
import { ProductVariation } from './entities/product_variations.entity';
import { ProductAttributeValue } from './entities/product_attribute_values.entity';
import { OrderItemAttribute } from './entities/order_item_attributes.entity';
import { ProductAttributeService } from './product-attribute.service';
import { ProductAttributeController } from './product-attribute.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Attribute,
      AttributeValue,
      ProductAttribute,
      CategoryAttribute,
      VariationAttributeValue,
      ProductVariation, // ✅
      ProductAttributeValue, // ✅ nouvelle table
      OrderItemAttribute, // ✅ nouvelle table
    ]),
  ],
  // ⚠️ ProductAttributeController AVANT AttributeController :
  //    ses routes à 2 segments (products/:id…) ne doivent pas être masquées
  controllers: [ProductAttributeController, AttributeController],
  providers: [AttributeService, ProductAttributeService],
  exports: [AttributeService, ProductAttributeService, TypeOrmModule],
})
export class AttributeModule { }
