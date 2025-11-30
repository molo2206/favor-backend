import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from 'src/order/enum/order.status.enum';
export class UpdateReservationStatusDto {
  @IsEnum(OrderStatus, { message: 'Status invalide' })
  status: OrderStatus;

  @IsOptional()
  @IsString()
  reason?: string; // facultatif si tu veux expliquer pourquoi c'est annulé, rejeté, etc.
}
