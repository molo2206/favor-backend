import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverLocationService } from './driver-location.service';
import { DriverLocationController } from './driver-location.controller';
import { DriverLocation } from './entity/DriverLocation.entity';
import { DriverVehicle } from '../DriverVehicle/entity/DriverVehicle.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DriverLocation, DriverVehicle,UserEntity])],
  controllers: [DriverLocationController],
  providers: [DriverLocationService],
  exports: [DriverLocationService],
})
export class DriverLocationModule {}
