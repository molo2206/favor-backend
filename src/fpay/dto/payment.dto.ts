// src/modules/fpay/dto/payment.dto.ts
import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, Max, Length, Matches, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class FpayPaymentDto {
    @ApiProperty({
        example: '243973760641',
        description: 'Numéro de téléphone de l\'expéditeur (client payeur)'
    })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({
        example: '1234',
        description: 'Code PIN de l\'expéditeur (4 chiffres)'
    })
    @IsString()
    @IsNotEmpty()
    @Length(4, 4)
    @Matches(/^\d+$/, { message: 'Le PIN doit contenir uniquement des chiffres' })
    pin: string;

    @ApiProperty({
        example: 100,
        description: 'Montant du paiement'
    })
    @IsNumber()
    @Min(0.01)
    @Type(() => Number)
    amount: number;

    @ApiProperty({
        example: 'USD',
        description: 'Devise (USD, EUR, CDF, etc.)'
    })
    @IsString()
    @IsNotEmpty()
    currency: string;

    @ApiProperty({
        example: 'Achat produit',
        description: 'Description du paiement',
        required: false
    })
    @IsString()
    @IsOptional()
    description?: string;
}