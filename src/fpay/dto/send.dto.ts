// src/modules/fpay/dto/send.dto.ts

import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, Length, Matches, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class FpaySendDto {
    @ApiProperty({
        example: '3a4a6098-622a-47f4-a10a-76cc00cf1aea',
        description: 'ID du client payeur (expéditeur)'
    })
    @IsUUID()
    @IsNotEmpty()
    userId: string;

   
    @ApiProperty({
        example: 100,
        description: 'Montant à envoyer'
    })
    @IsNumber()
    @Min(0.01)
    @Type(() => Number)
    amount: number;

    @ApiProperty({
        example: 'USD',
        description: 'Devise (USD, EUR, CDF, etc.)',
        required: false
    })
    @IsString()
    @IsOptional()
    currency?: string;

    @ApiProperty({
        example: 'Transfert à mon fils',
        description: 'Description de l\'envoi',
        required: false
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
        example: 'CD',
        description: 'Code pays du destinataire',
        required: false
    })
    @IsString()
    @IsOptional()
    countryCode?: string;
}