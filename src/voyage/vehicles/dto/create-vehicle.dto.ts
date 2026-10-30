// dto/create-vehicle.dto.ts
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  IsUrl,
  Min,
  Max,
  ValidateNested,
  IsInt,
} from 'class-validator';
import { VehicleType } from '../enum/vehicle-type.enum';
import { VehicleStatus } from '../enum/vehicle-status.enum';
import { Transform, Type } from 'class-transformer';
import { SeatType } from 'src/voyage/seats/enums/seat-type.enum';

class SeatItemDto {
  @IsString()
  seatNumber: string;

  @IsEnum(SeatType)
  seatType: SeatType;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;                    // 👈 ajout de l'ordre
}

export class CreateVehicleDto {
  @IsString()
  licensePlate: string;

  @IsEnum(VehicleType)
  @Transform(({ value }) => value?.toUpperCase())
  vehicleType: VehicleType;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @Transform(({ value }) => parseInt(value, 10))
  totalSeats: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @Transform(({ value }) => (value ? parseFloat(value) : undefined))
  maxBaggageWeightPerPassenger?: number;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  images?: string[];

  @IsOptional()
  @IsEnum(VehicleStatus)
  @Transform(({ value }) => value?.toUpperCase())
  status?: VehicleStatus;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return value;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatItemDto)
  seats?: SeatItemDto[];
}