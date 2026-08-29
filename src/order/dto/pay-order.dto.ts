// pay-order.dto.ts
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';


export class PayOrderDto {
    @IsUUID()
    @IsNotEmpty()
    orderId: string;

    @IsEnum(PaymentMethod)
    @IsNotEmpty()
    paymentMethod: PaymentMethod; // MOBILE_MONEY ou FPAY

    @IsOptional()
    @IsString()
    provider?: string; // Pour MOBILE_MONEY (ex: ORANGE, MTN, etc.)

    @IsOptional()
    @IsString()
    phone?: string; // Pour MOBILE_MONEY

    @IsOptional()
    @IsString()
    access_token?: string; // Pour FPAY
}