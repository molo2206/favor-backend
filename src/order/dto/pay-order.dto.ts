// pay-order.dto.ts
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
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

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    transactionFee?: number;

    /** ✅ Moyen de paiement enregistré de l'utilisateur : remplit mode, opérateur, numéro */
    @IsOptional()
    @IsUUID()
    paymentMethodId?: string;

    /** ✅ Taux appliqué par le front pour calculer transactionFee (enregistré sur la commande) */
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    appliedFeeRate?: number;
}