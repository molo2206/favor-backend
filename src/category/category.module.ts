import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { CategoryEntity } from './entities/category.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { CategorySpecificationModule } from 'src/specification/category-specification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CategoryEntity]),
    CategorySpecificationModule, // <-- IMPORT du module qui contient le service et ses repositories
  ],
  controllers: [CategoryController],
  providers: [CategoryService, CloudinaryService],
  exports: [CategoryService],
})
export class CategoryModule {}
