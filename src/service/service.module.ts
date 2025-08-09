import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from './entities/service.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { ServiceService } from './service.service';
import { ServiceController } from './service.controller';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Service, CategoryEntity]),
  ],
  providers: [ServiceService, CloudinaryService],
  controllers: [ServiceController],
  exports: [ServiceService], 
})
export class ServiceModule {}
