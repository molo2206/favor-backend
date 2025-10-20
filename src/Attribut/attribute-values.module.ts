import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttributeValue } from './entities/attribute_values.entity';
import { ProductAttribute } from './entities/product_attributes.entity';
import { AttributeValueService } from './attribute_values.service';
import { AttributeValueController } from './attribute_values.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AttributeValue, ProductAttribute])],
  providers: [AttributeValueService],
  controllers: [AttributeValueController],
  exports: [AttributeValueService],
})
export class AttributeValuesModule {}
