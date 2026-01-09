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
import { UserEntity } from 'src/users/entities/user.entity';
import { UserPlatformRoleEntity } from 'src/users/entities/user_plateform_roles.entity';
import { NotificationsModule } from 'src/notification/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Service,
      CategoryEntity,
      PrestataireEntity,
      ServiceHasPrestataire,
      CompanyEntity,
      UserEntity,
      UserPlatformRoleEntity, 
    ]),
    NotificationsModule, 
  ],
  providers: [
    ServiceService,
    CloudinaryService,
  ],
  controllers: [ServiceController],
  exports: [ServiceService],
})
export class ServiceModule {}
