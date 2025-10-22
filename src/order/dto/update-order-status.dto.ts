import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, ValidateIf } from 'class-validator';
import { OrderStatus } from 'src/order/enum/order.status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @Type(() => Number)
  @IsNumber()
  @ValidateIf(o => o.status === OrderStatus.VALIDATED)
  @IsNotEmpty({ message: 'Le champ shippingCost est obligatoire lorsque le statut est VALIDATED' })
  shippingCost?: number;
}
