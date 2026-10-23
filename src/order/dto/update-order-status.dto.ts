import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, ValidateIf } from 'class-validator';
import { OrderStatus } from 'src/order/enum/order.status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus, { message: 'Le statut fourni est invalide' })
  status: OrderStatus;
}
