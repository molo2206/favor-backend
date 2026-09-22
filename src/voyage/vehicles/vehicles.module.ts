import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';
import { Vehicle } from './entities/vehicle.entity';
import { CompanyEntity } from '../../company/entities/company.entity';
import { VehicleSchedule } from './entities/vehicle-schedule.entity';
import { FilesModule } from 'src/files/files.module';
import { VehicleSeat } from '../seats/entities/seat.entity';
import { CommonModule } from 'src/libs/common/src/common.module';   // ✅ Importer CommonModule (et non I18nModule)

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, CompanyEntity, VehicleSchedule, VehicleSeat]),
    FilesModule,
    CommonModule, 
  ],
  controllers: [VehiclesController],
  providers: [VehiclesService],
})
export class VehiclesModule {}