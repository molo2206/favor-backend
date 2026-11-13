import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { Ride } from '../Ride/entity/Ride.entity';
import { DriverVehicle } from '../DriverVehicle/entity/DriverVehicle.entity';
import { DriverAssociation } from './entity/driver-association.entity';
import { DriverProfile } from './entity/driver-profile.entity';
import { DriverAssociationService } from './driver-association.service';
import { DriverAssociationController } from './driver-association.controller';

/** ✅ Chauffeurs privés / membres d'une association (part de l'association sur les courses) */
@Module({
  imports: [TypeOrmModule.forFeature([DriverAssociation, DriverProfile, UserEntity, Ride, DriverVehicle])],
  controllers: [DriverAssociationController],
  providers: [DriverAssociationService],
  exports: [DriverAssociationService],
})
export class DriverAssociationModule { }
