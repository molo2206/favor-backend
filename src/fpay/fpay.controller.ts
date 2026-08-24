// src/modules/fpay/fpay.controller.ts
import {
    Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards,
    Query, Res, Ip, Logger
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { FpayService } from './fpay.service';
import { FpayPaymentDto } from './dto/payment.dto';
import { FpaySendDto } from './dto/send.dto';
import { FpayResponse, PaymentResponseDto } from './dto/response.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuthLoginDto } from './dto/link-user.dto';
import * as crypto from 'crypto';

@ApiTags('FPAY')
@Controller('fpay')
export class FpayController {
    private readonly logger = new Logger(FpayController.name);

    constructor(private readonly fpayService: FpayService) { }

    // ============================================================
    // 1. AUTHENTIFICATION - REDIRIGE VERS FPAY
    // ============================================================
    @Post('link-user')
    async linkUserFromFpay(
        @Body() body: {
            systemUserId: string;
            fpayUserId: string;
            accessToken?: string;
            refreshToken?: string;
        },
        @Res() res: Response,
    ) {
        try {
            console.log('[Favor Help] 📥 Requête de lien reçue de FPay');
            console.log('[Favor Help] Body complet:', JSON.stringify(body, null, 2));
            console.log(`[Favor Help] systemUserId: ${body.systemUserId}`);
            console.log(`[Favor Help] fpayUserId: ${body.fpayUserId}`);

            // ✅ Vérifier que systemUserId est présent
            if (!body.systemUserId) {
                console.error('[Favor Help] ❌ systemUserId manquant !');
                return res.status(400).json({
                    success: false,
                    message: 'systemUserId est requis',
                });
            }

            // ✅ Sauvegarder le userIdFpay dans UserEntity
            await this.fpayService.saveFpayUserId(body.systemUserId, body.fpayUserId);

            console.log('[Favor Help] ✅ Compte lié avec succès');

            return res.status(200).json({
                success: true,
                message: 'Compte lié avec succès',
                data: {
                    systemUserId: body.systemUserId,
                    fpayUserId: body.fpayUserId,
                },
            });

        } catch (error) {
            console.error('[Favor Help] ❌ Erreur:', error.message);
            return res.status(400).json({
                success: false,
                message: error.message || 'Erreur lors de la liaison',
            });
        }
    }

    @Post('auth/link-user')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    async login(
        @Body() authDto: AuthLoginDto,
        @CurrentUser() user: UserEntity,
        @Res() res: Response,
    ): Promise<any> {
        try {
            const systemUserId = user?.id;

            if (!systemUserId) {
                this.logger.error('❌ Utilisateur non authentifié');
                return res.status(401).json({
                    status: 'error',
                    message: 'Utilisateur non authentifié',
                });
            }

            this.logger.log(`[Favor Help] 🔑 Utilisateur connecté: ${systemUserId}`);

            if (!authDto || !authDto.phone || !authDto.password) {
                const fpayUrl = process.env.FPAY_API_URL || 'https://f-pay.favorhelp.com';
                const authCode = crypto.randomBytes(32).toString('hex');
                const clientId = authDto?.clientId || 'web-client';

                // ✅ Le callback doit pointer vers FPay
                const callbackUrl = process.env.OAUTH_CALLBACK_URL || 'https://f-pay.favorhelp.com/oauth/callback';

                const redirectUrl = new URL(`${fpayUrl}/oauth/login`);
                redirectUrl.searchParams.set('client_id', clientId);
                redirectUrl.searchParams.set('code', authCode);

                // ✅ AJOUTER system_user_id dans l'URL
                redirectUrl.searchParams.set('system_user_id', systemUserId);
                redirectUrl.searchParams.set('redirect_uri', callbackUrl);

                this.logger.log(`🔗 URL OAuth FPay: ${redirectUrl.toString()}`);
                this.logger.log(`📌 system_user_id: ${systemUserId}`);

                return res.json({
                    status: 'success',
                    message: 'Page OAuth FPay',
                    url: redirectUrl.toString(),
                    openInBrowser: redirectUrl.toString(),
                    systemUserId: systemUserId,
                });
            }

            // ✅ CAS 2 : phone ET password fournis
            const result = await this.fpayService.login(authDto, user.id);

            if (result.requiresOtp === true) {
                const fpayUrl = process.env.FPAY_API_URL || 'https://f-pay.favorhelp.com';
                const authCode = crypto.randomBytes(32).toString('hex');
                const clientId = authDto.clientId || 'web-client';

                const callbackUrl = process.env.OAUTH_CALLBACK_URL || 'https://f-pay.favorhelp.com/oauth/callback';

                const redirectUrl = new URL(`${fpayUrl}/oauth/login`);
                redirectUrl.searchParams.set('client_id', clientId);
                redirectUrl.searchParams.set('code', authCode);

                // ✅ AJOUTER system_user_id dans l'URL
                redirectUrl.searchParams.set('system_user_id', systemUserId);
                redirectUrl.searchParams.set('redirect_uri', callbackUrl);

                this.logger.log(`🔗 URL OAuth FPay (OTP): ${redirectUrl.toString()}`);

                return res.json({
                    status: 'success',
                    message: 'Code OTP envoyé avec succès. Veuillez vous connecter sur FPay.',
                    requiresOtp: true,
                    url: redirectUrl.toString(),
                    openInBrowser: redirectUrl.toString(),
                    systemUserId: systemUserId,
                });
            }

            return result;

        } catch (error) {
            this.logger.error(`❌ Erreur: ${error.message}`);
            return res.status(400).json({
                status: 'error',
                message: error.message || 'Erreur lors de l\'authentification',
            });
        }
    }

    // ============================================================
    // 2. PAIEMENT
    // ============================================================

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
        return this.fpayService.makePayment(paymentDto, user);
    }

    // ============================================================
    // 3. ENVOI (LOGISTIC)
    // ============================================================

    @Post('send')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Effectuer un envoi FPAY',
        description: 'Effectue un envoi depuis le portefeuille du client vers le destinataire'
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

    // ============================================================
    // 4. PROCESSUS COMPLET
    // ============================================================

    @Post('process-full-payment')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Processus complet de paiement FPAY',
        description: 'Authentifie l\'utilisateur et effectue le paiement'
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
        return this.fpayService.processFullPayment(body.auth, body.payment, user);
    }
}