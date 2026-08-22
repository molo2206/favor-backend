// update-trip.dto.ts
import { IsOptional, IsArray, ValidateNested, IsUUID, IsString, IsDateString, IsNumber, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ScheduleStatus } from '../../vehicles/enum/schedule-status.enum';
import { CreateMealDto } from './create-trip.dto';

// DTO pour mettre à jour un segment
export class UpdateSegmentDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  segment_order?: number;

  @IsOptional()
  @IsUUID()
  vehicle_id?: string;

  @IsOptional()
  @IsString()
  departure_city?: string;

  @IsOptional()
  @IsString()
  arrival_city?: string;

  @IsOptional()
  @IsDateString()
  departure_datetime?: string;

  @IsOptional()
  @IsDateString()
  estimated_arrival_datetime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distance_km?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimated_duration_minutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  segment_price?: number;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;
}

// DTO principal de mise à jour - NE PAS étendre Partial<CreateTripDto>
export class UpdateTripDto {
  @IsOptional()
  @IsUUID()
  schedule_id?: string;

  @IsOptional()
  @IsUUID()
  vehicle_id?: string;

  @IsOptional()
  @IsDateString()
  departure_datetime?: string;

  @IsOptional()
  @IsDateString()
  actual_departure_datetime?: string;

  @IsOptional()
  @IsDateString()
  actual_arrival_datetime?: string;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSegmentDto)
  segments?: UpdateSegmentDto[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  delete_segments?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMealDto)
  meals?: CreateMealDto[];
}