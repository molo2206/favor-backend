import { IsEnum } from 'class-validator';
import { PaymentStatus } from '../enum/paymentStatus.enum';

export class UpdateSaleStatusDto {
  @IsEnum(PaymentStatus)
  status: PaymentStatus;
}
