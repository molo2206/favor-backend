import { IsString, IsEnum, IsBoolean, IsDateString, IsUUID, IsOptional } from 'class-validator';
import { TrackingltaType } from '../entity/tracking-lta.entity';

export class CreateTrackingLtaDto {
  @IsString()
  name: string;

  @IsDateString()
  time: string; 

  @IsBoolean()
  @IsOptional()
  completed?: boolean = false;

  @IsEnum(TrackingltaType)
  type: TrackingltaType;

  @IsUUID()
  ltaId: string;

  @IsUUID()
  createdById: string;

  @IsUUID()
  updatedById: string;
}
