import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';
import { Type } from 'class-transformer';

export class MobileMoneyDetailsDto {
  @IsString()
  providerId: string;

  @IsString()
  phone: string;
}

export class PayReservationDto {
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @ValidateNested()
  @Type(() => MobileMoneyDetailsDto)
  mobileMoneyDetails?: MobileMoneyDetailsDto;
}