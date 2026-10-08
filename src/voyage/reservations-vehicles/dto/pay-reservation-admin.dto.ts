import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';

export class AdminMobileMoneyDetailsDto {
    @IsString()
    providerId: string;

    @IsString()
    phone: string;
}

export class PayReservationAdminDto {
    @IsEnum(PaymentMethod)
    paymentMethod: PaymentMethod; // CASH ou MOBILE_MONEY

    @IsOptional()
    @ValidateNested()
    @Type(() => AdminMobileMoneyDetailsDto)
    mobileMoneyDetails?: AdminMobileMoneyDetailsDto;
}