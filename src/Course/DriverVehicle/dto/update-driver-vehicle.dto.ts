import { PartialType } from '@nestjs/mapped-types';
import { CreateDriverVehicleDto } from './create-driver-vehicle.dto';

export class UpdateDriverVehicleDto extends PartialType(CreateDriverVehicleDto) {}
