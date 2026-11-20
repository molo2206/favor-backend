// driver-vehicle.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverVehicleService } from './driver-vehicle.service';
import { DriverVehicleController } from './driver-vehicle.controller';
import { DriverVehicle } from './entity/DriverVehicle.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { FilesModule } from 'src/files/files.module';
import { NotificationsModule } from 'src/notification/notifications.module';
import { I18nModule } from 'src/libs/common/src';
import { DriverProfile } from '../DriverAssociation/entity/driver-profile.entity';

@Module({
  imports: [
    FilesModule,
    TypeOrmModule.forFeature([DriverVehicle, UserEntity, DriverProfile]),
    // ✅ Notification au chauffeur (documents validés / refusés) — NotificationsService + FcmService
    forwardRef(() => NotificationsModule),
    I18nModule,
  ],
  controllers: [DriverVehicleController],
  providers: [DriverVehicleService],
  exports: [DriverVehicleService],
})
export class DriverVehicleModule {}
