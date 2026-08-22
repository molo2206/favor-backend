// driver-vehicle.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverVehicleService } from './driver-vehicle.service';
import { DriverVehicleController } from './driver-vehicle.controller';
import { DriverVehicle } from './entity/DriverVehicle.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { UserEntity } from 'src/users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DriverVehicle,UserEntity])],
  controllers: [DriverVehicleController],
  providers: [DriverVehicleService,CloudinaryService],
  exports: [DriverVehicleService],
})
export class DriverVehicleModule {}
