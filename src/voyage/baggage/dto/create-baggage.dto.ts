// dto/create-baggage.dto.ts
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { BaggageType } from '../enum/baggage-type.enum';

export class CreateBaggageDto {
  @IsUUID()
  reservationId: string;

  @IsEnum(BaggageType)
  baggageType: BaggageType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  extraFee?: number;
}
