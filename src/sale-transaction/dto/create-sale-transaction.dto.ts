import { IsUUID, IsNumber, IsEnum, IsDateString } from 'class-validator';
import { PaymentStatus } from '../enum/paymentStatus.enum';

export class CreateSaleTransactionDto {
  @IsUUID()
  vehicleId: string;

  @IsNumber()
  salePrice: number;

  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;

  @IsDateString()
  date: string;
}
