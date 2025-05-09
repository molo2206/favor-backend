import { IsEnum } from 'class-validator';
import { OrderStatus } from 'src/users/utility/common/order.status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
