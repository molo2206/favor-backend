import { IsUUID, IsNumber, IsEnum, IsDateString, IsOptional } from 'class-validator';
import { PaymentStatus } from '../enum/paymentStatus.enum';

export class CreateSaleTransactionDto {
  @IsUUID()
  vehicleId: string;

  @IsNumber()
  salePrice: number;

  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @IsDateString()
  date: string;
}
