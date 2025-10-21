import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from './entities/category.entity';
import { CategorySpecification } from 'src/specification/entities/CategorySpecification.entity';
import { Specification } from 'src/specification/entities/Specification.entity';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { CategoryAttribute } from 'src/Attribut/entities/category_attributes.entity';
import { CategorySpecificationModule } from 'src/specification/category-specification.module';
import { GlobalAttributesModule } from 'src/Attribut/global-attributes.module';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CategoryEntity,
      CategorySpecification,
      CategoryAttribute,
      Specification,
    ]),
    CategorySpecificationModule,
    GlobalAttributesModule, // ✅ très important
  ],
  controllers: [CategoryController],
  providers: [CategoryService, CloudinaryService],
  exports: [CategoryService],
})
export class CategoryModule {}
