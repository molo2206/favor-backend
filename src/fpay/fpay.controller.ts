// src/modules/fpay/fpay.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FpayService } from './fpay.service';
import { FpayPaymentDto } from './dto/payment.dto';
import {
    FpayResponse,
    AuthSuccessResponse,
    PaymentResponseDto
} from './dto/response.dto';
import { AuthLoginDto } from './dto/link-user.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { FpaySendDto } from './dto/send.dto';

@ApiTags('FPAY')
@Controller('fpay')
export class FpayController {
    constructor(private readonly fpayService: FpayService) { }

    @Post('auth/link-user')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Authentifier un utilisateur FPAY',
        description: 'Authentifie un utilisateur avec son numéro de téléphone, mot de passe et code OTP'
    })
    async login(
        @Body() authDto: AuthLoginDto,
        @CurrentUser() user: UserEntity
    ): Promise<any> {
        try {
            const result = await this.fpayService.login(authDto, user.id);
            return result;
        } catch (error) {
            return {
                success: false,
                message: error.message || 'Erreur lors de l\'authentification'
            };
        }
    }

    // ✅ PAIEMENT - Le destinataire est l'utilisateur connecté
    @Post('pay')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Effectuer un paiement FPAY',
        description: 'Effectue un paiement depuis le portefeuille FPAY vers l\'utilisateur connecté'
    })
    @ApiResponse({
        status: 200,
        description: 'Paiement effectué avec succès',
        type: Object
    })
    @ApiResponse({ status: 400, description: 'Données invalides' })
    @ApiResponse({ status: 401, description: 'Non autorisé' })
    @ApiResponse({ status: 402, description: 'Fonds insuffisants' })
    @ApiResponse({ status: 404, description: 'Bénéficiaire introuvable' })
    async makePayment(
        @Body() paymentDto: FpayPaymentDto,
        @CurrentUser() user: UserEntity
    ): Promise<FpayResponse<PaymentResponseDto>> {
        // 🔥 Passer l'utilisateur connecté comme destinataire
        return this.fpayService.makePayment(paymentDto, user);
    }

    @Post('send')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Effectuer un envoi FPAY',
        description: 'Effectue un envoi depuis le portefeuille du client vers le destinataire (identifié par l\'API Key du service)'
    })
    @ApiResponse({
        status: 200,
        description: 'Envoi effectué avec succès',
        type: Object
    })
    @ApiResponse({ status: 400, description: 'Données invalides' })
    @ApiResponse({ status: 401, description: 'Non autorisé' })
    @ApiResponse({ status: 402, description: 'Fonds insuffisants' })
    @ApiResponse({ status: 404, description: 'Client ou destinataire introuvable' })
    async makeSend(
        @Body() sendDto: FpaySendDto,
        @CurrentUser() user: UserEntity
    ): Promise<FpayResponse<PaymentResponseDto>> {
        return this.fpayService.makeSend(sendDto, user);
    }


    // ✅ PROCESSUS COMPLET
    @Post('process-full-payment')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Processus complet de paiement FPAY',
        description: 'Authentifie l\'utilisateur et effectue le paiement vers l\'utilisateur connecté'
    })
    @ApiResponse({
        status: 200,
        description: 'Paiement complet réussi',
        type: Object
    })
    async processFullPayment(
        @Body() body: {
            auth: AuthLoginDto;
            payment: FpayPaymentDto;
        },
        @CurrentUser() user: UserEntity
    ): Promise<{
        auth: any;
        payment: FpayResponse<PaymentResponseDto>;
    }> {
        // 🔥 Passer l'utilisateur connecté comme destinataire
        return this.fpayService.processFullPayment(body.auth, body.payment, user);
    }
}