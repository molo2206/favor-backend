// src/fpay/dto/cashout.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

/**
 * ✅ Retrait (cashout) du wallet F-Pay du client vers son Mobile Money, protégé par OTP F-Pay (pas de PIN)
 *   Le compte F-Pay est déjà lié (users.userIdFpay) : aucun token F-Pay à envoyer.
 *   1. POST /fpay/cashout/request  { amount, provider, phone, walletId? } → code envoyé par SMS (rien n'est débité)
 *   2. POST /fpay/cashout/confirm  { requestId, otpCode }                → retrait exécuté
 */
export class FpayCashoutRequestDto {
    @ApiProperty({ example: 5000, description: 'Montant retiré (devise du wallet choisi)' })
    @Type(() => Number)
    @IsNumber({}, { message: 'Le montant doit être un nombre' })
    @Min(0.01, { message: 'Le montant doit être supérieur à 0' })
    amount: number;

    @ApiProperty({ example: 'VODACOM_MPESA_COD', description: 'name du réseau Mobile Money (network_provider F-Pay)' })
    @IsString()
    @IsNotEmpty({ message: 'Le réseau Mobile Money est requis' })
    provider: string;

    @ApiProperty({ example: '243810000000', description: 'Numéro Mobile Money qui reçoit l\'argent' })
    @IsString()
    @IsNotEmpty({ message: 'Le numéro Mobile Money est requis' })
    phone: string;

    @ApiPropertyOptional({ description: 'Wallet F-Pay débité (sinon le wallet par défaut)' })
    @IsOptional()
    @IsString()
    walletId?: string;
}

export class FpayCashoutConfirmDto {
    @ApiProperty({ description: 'requestId reçu à l\'étape 1' })
    @IsString()
    @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'requestId invalide' })
    requestId: string;

    @ApiProperty({ example: '1234', description: 'Code à 4 chiffres reçu par SMS de F-Pay' })
    @IsString()
    @Matches(/^\d{4}$/, { message: 'Le code doit contenir 4 chiffres' })
    otpCode: string;
}
