// src/modules/fpay/dto/payment.dto.ts

export class FpayPaymentDto {
    @IsNumber()
    @Min(0.01)
    amount: number;

    @IsString()
    @IsNotEmpty()
    currency: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsString()
    @IsNotEmpty({ message: 'Le token d\'accès est requis' })
    access_token: string;  // ✅ Obligatoire
}