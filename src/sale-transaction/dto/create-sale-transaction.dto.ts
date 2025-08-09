import { IsUUID, IsEnum, IsDateString, IsOptional, IsNumber } from 'class-validator';
import { PaymentStatus } from '../enum/paymentStatus.enum';

export class CreateSaleTransactionDto {
  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsNumber()
  salePrice?: number; // optionnel, calculé si absent

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus; // optionnel, on met PENDING par défaut

  @IsDateString()
  date: string;
}
