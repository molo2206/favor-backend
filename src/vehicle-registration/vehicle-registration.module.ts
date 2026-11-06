import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from 'src/files/files.module';
import { I18nModule } from 'src/libs/common/src';
import { VehicleRegistration } from './entities/vehicle-registration.entity';
import { VehicleRegistrationService } from './vehicle-registration.service';
import { VehicleRegistrationController } from './vehicle-registration.controller';

/** ✅ Enregistrement des véhicules (vente / location) avec propriétaire et commissionnaire */
@Module({
  imports: [TypeOrmModule.forFeature([VehicleRegistration]), FilesModule, I18nModule],
  controllers: [VehicleRegistrationController],
  providers: [VehicleRegistrationService],
  exports: [VehicleRegistrationService],
})
export class VehicleRegistrationModule { }
