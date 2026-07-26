// src/modules/fpay/dto/auth.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthLoginDto {
    @ApiProperty({
        example: '243973760641',
        description: 'Numéro de téléphone au format international'
    })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({ example: '12345678Pm@' })
    @IsString()
    @IsNotEmpty()
    password: string;

    @ApiProperty({
        example: '255199',
        description: 'Code OTP (optionnel)',
        required: false
    })
    @IsOptional() 
    @IsString()
    otpCode?: string; 
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