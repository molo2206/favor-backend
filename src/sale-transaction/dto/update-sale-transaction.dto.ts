import { IsDateString, IsEnum, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { PaymentStatus } from '../enum/paymentStatus.enum';

export class UpdateSaleTransactionDto {
  @IsUUID()
  @IsOptional()
  vehicleId?: string;

  @IsNumber()
  @IsOptional()
  salePrice?: number;

  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @IsDateString()
  @IsOptional()
  date?: string;
}
