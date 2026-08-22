import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from 'src/order/enum/order.status.enum';
import { ReservationStatus } from '../enum/reservation-room.enum';
export class UpdateReservationStatusDto {
  @IsEnum(ReservationStatus, { message: 'Status invalide' })
  status: ReservationStatus;

  @IsOptional()
  @IsString()
  reason?: string; // facultatif si tu veux expliquer pourquoi c'est annulé, rejeté, etc.
}
