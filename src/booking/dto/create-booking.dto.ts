import { IsUUID, IsNotEmpty, IsDateString, IsOptional, IsInt, Min, IsEnum } from 'class-validator';
import { BookingStatus } from 'src/room/enum/bookingstatus.enum';

export class CreateBookingDto {
  @IsUUID()
  @IsNotEmpty()
  roomId: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsDateString()
  @IsNotEmpty()
  checkInDate: string;

  @IsDateString()
  @IsNotEmpty()
  checkOutDate: string;

  @IsInt()
  @Min(1)
  guests: number;

  @IsEnum(BookingStatus)
  @IsOptional()
  status?: BookingStatus;
}
