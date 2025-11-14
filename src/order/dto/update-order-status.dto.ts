import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, ValidateIf } from 'class-validator';
import { OrderStatus } from 'src/order/enum/order.status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus, { message: 'Le statut fourni est invalide' })
  status: OrderStatus;

  @Type(() => Number)
  @IsNumber({}, { message: 'Le coût de livraison doit être un nombre' })
  @ValidateIf(o => o.status === OrderStatus.VALIDATED)
  @IsNotEmpty({ message: 'Le champ shippingCost est obligatoire lorsque le statut est VALIDATED' })
  @IsOptional()
  shippingCost?: number;
}
