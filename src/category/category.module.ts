import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from './entities/category.entity';
import { CategorySpecification } from 'src/specification/entities/CategorySpecification.entity';
import { Specification } from 'src/specification/entities/Specification.entity';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { CategorySpecificationModule } from 'src/specification/category-specification.module';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { CategoryAttribute } from 'src/AttributGlobal/entities/category_attributes.entity';
import { Attribute } from 'src/AttributGlobal/entities/attributes.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CategoryEntity,
      CategorySpecification,
      CategoryAttribute,
      Specification,
      Attribute,
    ]),
    CategorySpecificationModule,
  ],
  controllers: [CategoryController],
  providers: [CategoryService, CloudinaryService],
  exports: [CategoryService],
})
export class CategoryModule {}
