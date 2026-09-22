// dto/update-vehicle-status.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { VehicleStatus } from '../enum/vehicle-status.enum';
import { Transform } from 'class-transformer';

export class UpdateVehicleStatusDto {
  @IsEnum(VehicleStatus)
  @Transform(({ value }) => value?.toUpperCase())
  status: VehicleStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}