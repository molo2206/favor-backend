// src/modules/fpay/dto/auth.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthLoginDto {
    @ApiProperty({
        example: '243973760641',
        description: 'Numéro de téléphone au format international',
        required: false
    })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiProperty({
        example: '12345678Pm@',
        required: false
    })
    @IsOptional()
    @IsString()
    password?: string;

    @ApiProperty({
        example: '255199',
        description: 'Code OTP (optionnel)',
        required: false
    })
    @IsOptional()
    @IsString()
    otpCode?: string;

    @ApiProperty({
        example: 'web-client',
        description: 'Client ID (optionnel)',
        required: false,
        default: 'web-client'
    })
    @IsOptional()
    @IsString()
    clientId?: string;

    // ✅ AJOUTER CES PROPRIÉTÉS
    @ApiProperty({
        example: 'http://localhost:3000/oauth/callback',
        description: 'URL de redirection après authentification',
        required: false
    })
    @IsOptional()
    @IsString()
    redirectUri?: string;

    @ApiProperty({
        example: 'fr',
        description: 'Langue (fr, en, sw, ar, es)',
        required: false,
        default: 'fr'
    })
    @IsOptional()
    @IsString()
    lang?: string;
}

export class AuthResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    email: string | null;

    @ApiProperty()
    phone: string;

    @ApiProperty()
    full_name: string;

    @ApiProperty()
    role: string;

    @ApiProperty()
    status: string;

    @ApiProperty()
    profileImage: string;

    @ApiProperty()
    kycStatus: string;

    @ApiProperty()
    countryCode: string;
}