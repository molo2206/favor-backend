import { IsUUID, IsDateString, IsInt, Min, IsOptional } from 'class-validator';

export class UpdateRoomAvailabilityDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  roomsAvailable?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  roomsBooked?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  roomsRemaining?: number;
}
