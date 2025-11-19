import { IsUUID, IsDateString, IsInt, Min } from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  userId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsInt()
  @Min(1)
  adults: number;

  @IsInt()
  @Min(0)
  children: number;

  @IsInt()
  @Min(1)
  roomsBooked: number;
}
