import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { FleetVehicle } from './entities/fleet-vehicle.entity';
import { FleetMission } from './entities/fleet-mission.entity';
import { FleetFuelLog } from './entities/fleet-fuel-log.entity';
import { FleetMaintenance } from './entities/fleet-maintenance.entity';
import { FleetDocument } from './entities/fleet-document.entity';
import { FleetService } from './fleet.service';
import { FleetController } from './fleet.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FleetVehicle,
      FleetMission,
      FleetFuelLog,
      FleetMaintenance,
      FleetDocument,
      BranchEntity,
      UserEntity,
    ]),
  ],
  controllers: [FleetController],
  providers: [FleetService],
  exports: [FleetService],
})
export class FleetModule { }
