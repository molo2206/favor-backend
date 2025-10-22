import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber } from 'class-validator';
import { OrderStatus } from 'src/order/enum/order.status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  shippingCost: number;
}
