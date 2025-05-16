import { IsEnum } from 'class-validator';
import { OrderStatus } from 'src/order/enum/order.status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
