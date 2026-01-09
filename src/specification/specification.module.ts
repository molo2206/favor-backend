import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Specification } from './entities/Specification.entity';
import { SpecificationService } from './specification.service';
import { SpecificationController } from './specification.controller';
import { CategorySpecification } from './entities/CategorySpecification.entity';
import { ProductSpecificationValue } from './entities/ProductSpecificationValue.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Specification, CategorySpecification, ProductSpecificationValue]),
  ],
  controllers: [SpecificationController],
  providers: [SpecificationService, CloudinaryService],
  exports: [SpecificationService],
})
export class SpecificationModule {}
