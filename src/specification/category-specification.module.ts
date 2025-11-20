import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategorySpecificationService } from './category-specification.service';
import { CategorySpecificationController } from './category-specification.controller';
import { CategorySpecification } from './entities/CategorySpecification.entity';
import { Specification } from './entities/Specification.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CategorySpecification,
      Specification,
      CategoryEntity, 
    ]),
  ],
  providers: [CategorySpecificationService],
  controllers: [CategorySpecificationController],
  exports: [CategorySpecificationService],
})
export class CategorySpecificationModule {}
