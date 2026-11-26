// src/fpay/dto/payment.dto.ts
import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class FpayPaymentDto {
    @ApiProperty({
        example: 100,
        description: 'Montant du paiement'
    })
    @IsNumber({}, { message: 'Le montant doit être un nombre' })
    @Min(0.01, { message: 'Le montant doit être supérieur à 0' })
    @Type(() => Number)
    amount: number;

    @ApiProperty({
        example: 'USD',
        description: 'Devise (USD, EUR, CDF, etc.)'
    })
    @IsString({ message: 'La devise doit être une chaîne de caractères' })
    @IsNotEmpty({ message: 'La devise est requise' })
    currency: string;

    @ApiProperty({
        example: 'Achat produit',
        description: 'Description du paiement',
        required: false
    })
    @IsString({ message: 'La description doit être une chaîne de caractères' })
    @IsOptional()
    description?: string;

    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        description: 'Token JWT FPay de l\'acheteur (obligatoire)',
        required: true
    })
    @IsString({ message: 'Le token d\'accès doit être une chaîne de caractères' })
    @IsNotEmpty({ message: 'Le token d\'accès est requis' })
    access_token: string;
}