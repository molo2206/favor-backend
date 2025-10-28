import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from './entities/service.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { PrestataireEntity } from './entities/prestataires.entity';
import { ServiceHasPrestataire } from './entities/service_has_prestataire.entity';

import { ServiceService } from './service.service';
import { ServiceController } from './service.controller';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { CompanyEntity } from 'src/company/entities/company.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Service,
      CategoryEntity,
      PrestataireEntity,
      ServiceHasPrestataire,
      CompanyEntity
    ]),
  ],
  providers: [
    ServiceService,
    CloudinaryService, // Si tu utilises Cloudinary pour l’upload d’images
  ],
  controllers: [ServiceController],
  exports: [ServiceService], // Si d’autres modules doivent utiliser ServiceService
})
export class ServiceModule {}
