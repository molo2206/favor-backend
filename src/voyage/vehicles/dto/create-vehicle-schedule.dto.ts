import {
  IsString,
  IsDateString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
} from 'class-validator';
import { ScheduleStatus } from '../enum/schedule-status.enum';
import { Recurrence } from '../enum/recurrence.enum';

export class CreateVehicleScheduleDto {
  @IsString()
  vehicle_id: string;

  @IsString()
  driver_name: string;

  @IsOptional()
  @IsString()
  driver_phone?: string;

  @IsString()
  departure_city: string;

  @IsString()
  arrival_city: string;

  @IsDateString()
  departure_datetime: string;

  @IsDateString()
  estimated_arrival_datetime: string;

  @IsNumber()
  @Min(0)
  base_price: number;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  @IsOptional()
  @IsEnum(Recurrence)
  recurrence?: Recurrence;

  @IsOptional()
  @IsDateString()
  recurrence_end_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}