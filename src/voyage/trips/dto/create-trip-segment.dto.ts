// dto/create-trip.dto.ts
import { 
  IsUUID, 
  IsDateString, 
  IsEnum, 
  IsOptional, 
  IsArray, 
  ValidateNested,
  IsString,
  IsNumber,
  Min,
  ValidateIf 
} from 'class-validator';
import { Type } from 'class-transformer';
import { ScheduleStatus } from 'src/voyage/vehicles/enum/schedule-status.enum';

// DTO pour un segment (escale)
export class TripSegmentDto {
  @IsNumber()
  @Min(1)
  segment_order: number;

  @IsUUID()
  vehicle_id: string;

  @IsString()
  departure_city: string;

  @IsString()
  arrival_city: string;

  @IsDateString()
  departure_datetime: string;

  @IsDateString()
  estimated_arrival_datetime: string;

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
}

// DTO principal unifié
export class CreateTripDto {
  // ==================== CHAMPS POUR VOYAGE SIMPLE ====================
  @ValidateIf(o => !o.segments || o.segments.length === 0)
  @IsUUID()
  schedule_id?: string;

  @ValidateIf(o => !o.segments || o.segments.length === 0)
  @IsUUID()
  vehicle_id?: string;

  // ==================== CHAMPS COMMUNS ====================
  @IsDateString()
  departure_datetime: string;

  @IsOptional()
  @IsDateString()
  actual_departure_datetime?: string;

  @IsOptional()
  @IsDateString()
  actual_arrival_datetime?: string;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  // ==================== CHAMPS POUR VOYAGE AVEC ESCALES ====================
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripSegmentDto)
  segments?: TripSegmentDto[];
}