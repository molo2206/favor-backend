import {
  IsEnum,
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { SeatType } from '../enums/seat-type.enum';
import { Type } from 'class-transformer';

export class CreateSeatDto {
  @IsUUID()
  vehicleId: string;

  @IsString()
  seatNumber: string;

  @IsEnum(SeatType)
  seatType: SeatType;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;           // 👈 L'utilisateur peut spécifier l'ordre
}

class SeatItemDto {
  @IsString()
  seatNumber: string;

  @IsEnum(SeatType)
  seatType: SeatType;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;           // 👈 L'utilisateur peut spécifier l'ordre
}

export class CreateManySeatsDto {
  @IsUUID()
  vehicleId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatItemDto)
  seats: SeatItemDto[];
}