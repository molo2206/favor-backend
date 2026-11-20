// dto/create-colis-tracking.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ColisTrackingStatus } from '../entity/colis-tracking.entity';

export class CreateColisTrackingDto {
  @IsEnum(ColisTrackingStatus)
  status: ColisTrackingStatus;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
