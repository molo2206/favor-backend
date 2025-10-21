import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalAttribute } from './entities/global_attributes.entity';
import { GlobalAttributeValue } from './entities/global_attribute_values.entity';
import { Specification } from 'src/specification/entities/Specification.entity';
import { GlobalAttributeService } from './global_attributes.service';
import { GlobalAttributeController } from './global_attributes.controller';
import { CategoryAttribute } from './entities/category_attributes.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GlobalAttribute,
      GlobalAttributeValue,
      Specification,
      CategoryAttribute,
      CategoryEntity,
    ]),
  ],
  providers: [GlobalAttributeService],
  controllers: [GlobalAttributeController],
  exports: [
    GlobalAttributeService,
    TypeOrmModule, // ✅ pour que le repo soit visible ailleurs
  ],
})
export class GlobalAttributesModule {}
