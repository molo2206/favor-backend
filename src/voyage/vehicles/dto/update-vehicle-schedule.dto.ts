// dto/update-vehicle-schedule.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateVehicleScheduleDto } from './create-vehicle-schedule.dto';

export class UpdateVehicleScheduleDto extends PartialType(CreateVehicleScheduleDto) {}