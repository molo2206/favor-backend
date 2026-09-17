import {
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  IsOptional,
} from 'class-validator';

export class CreateRoomAvailabilityDto {
  @IsUUID()
  productId: string;

  @IsDateString()
  date: string;

  @IsInt()
  @Min(0)
  roomsAvailable: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  roomsBooked?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  roomsRemaining?: number;
}
