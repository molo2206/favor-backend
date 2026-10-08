import { IsOptional, IsString, IsEnum, IsInt, Min } from 'class-validator';
import { SeatType } from '../enums/seat-type.enum';

export class UpdateSeatDto {
  @IsOptional()
  @IsString()
  seatNumber?: string;

  @IsOptional()
  @IsEnum(SeatType)
  seatType?: SeatType;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}