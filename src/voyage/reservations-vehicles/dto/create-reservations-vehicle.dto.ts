import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ReservationStatus } from '../enum/reservation-status.enum';

export class CreateReservationDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  tripId: string;

  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;
}
