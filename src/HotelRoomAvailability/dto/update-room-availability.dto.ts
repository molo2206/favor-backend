import { IsOptional, IsUUID, IsDateString, IsInt, Min } from 'class-validator';

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
}
