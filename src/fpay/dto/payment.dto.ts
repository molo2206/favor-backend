// src/modules/fpay/dto/payment.dto.ts
import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class FpayPaymentDto {
    amount: number;
    currency: string;
    description?: string;
    access_token: string;  // ✅ Présent et obligatoire
}