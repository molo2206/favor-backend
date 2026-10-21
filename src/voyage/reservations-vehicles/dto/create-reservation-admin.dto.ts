// create-reservation-admin.dto.ts
import { IsOptional, IsUUID } from 'class-validator';
import { CreateReservationDto } from './create-reservation.dto';

export class CreateReservationAdminDto extends CreateReservationDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}