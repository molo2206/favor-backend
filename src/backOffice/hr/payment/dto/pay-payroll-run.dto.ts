import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod } from '../enums/payment-method.enum';

export class PayPayrollRunDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}