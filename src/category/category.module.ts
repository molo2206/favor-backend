// category.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { CategoryEntity } from './entities/category.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { CategorySpecificationModule } from 'src/specification/category-specification.module';
import { CategorySpecification } from 'src/specification/entities/CategorySpecification.entity'; // Ajoutez
import { Specification } from 'src/specification/entities/Specification.entity'; // Ajoutez

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CategoryEntity,
      CategorySpecification, // Ajoutez cette entité
      Specification, // Ajoutez cette entité
    ]),
    CategorySpecificationModule,
  ],
  controllers: [CategoryController],
  providers: [CategoryService, CloudinaryService],
  exports: [CategoryService],
})
export class CategoryModule {}