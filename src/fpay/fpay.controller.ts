// src/modules/fpay/fpay.controller.ts
import {
    Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards,
    Query, Res, Ip, Logger,
    HttpException
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

            // ✅ Vérifier si l'utilisateur est déjà lié
            // const existingUser = await this.fpayService.findUserById(body.systemUserId);

            // if (existingUser && existingUser.userIdFpay && existingUser.isLink === true) {
            //     console.log(`⚠️ Utilisateur ${body.systemUserId} est déjà lié au compte FPay ${existingUser.userIdFpay}`);
            //     return res.status(400).json({
            //         success: false,
            //         message: 'Ce compte Favor Help est déjà lié à un compte FPay.',
            //         data: {
            //             isLinked: true,
            //             userIdFpay: existingUser.userIdFpay,
            //         },
            //     });
            // }

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

            // ✅ Vérifier si l'utilisateur est déjà lié
            if (user.userIdFpay && user.isLink === true) {
                this.logger.log(`⚠️ Utilisateur ${systemUserId} est déjà lié au compte FPay ${user.userIdFpay}`);

                return res.status(400).json({
                    status: 'error',
                    message: 'Votre compte Favor Help est déjà lié à un compte FPay.',
                    data: {
                        isLinked: true,
                        userIdFpay: user.userIdFpay,
                    },
                });
            }

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

    @Post('unlink-user')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Délier le compte FPay',
        description: 'Délie le compte FPay de l\'utilisateur connecté'
    })
    @ApiResponse({
        status: 200,
        description: 'Compte délié avec succès',
        schema: {
            example: {
                success: true,
                message: 'Compte FPay délié avec succès'
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Compte déjà délié ou utilisateur non trouvé' })
    @ApiResponse({ status: 401, description: 'Non autorisé' })
    async unlinkUser(
        @CurrentUser() user: UserEntity,
        @Res() res: Response,
    ): Promise<any> {
        try {
            const systemUserId = user?.id;

            if (!systemUserId) {
                this.logger.error('❌ Utilisateur non authentifié');
                return res.status(401).json({
                    success: false,
                    message: 'Utilisateur non authentifié',
                });
            }

            this.logger.log(`🔓 Utilisateur ${systemUserId} demande la déliaison`);

            const result = await this.fpayService.unlinkFpayUser(systemUserId);

            return res.status(200).json(result);

        } catch (error) {
            this.logger.error(`❌ Erreur lors de la déliaison: ${error.message}`);

            if (error.status === HttpStatus.NOT_FOUND) {
                return res.status(404).json({
                    success: false,
                    message: 'Utilisateur non trouvé',
                });
            }

            if (error.status === HttpStatus.BAD_REQUEST) {
                return res.status(400).json({
                    success: false,
                    message: error.message,
                });
            }

            return res.status(500).json({
                success: false,
                message: error.message || 'Erreur lors de la déliaison du compte',
            });
        }
    }

    // ============================================================
    // 2. PAIEMENT
    // ============================================================
    // src/modules/fpay/fpay.controller.ts

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
        @CurrentUser() user: UserEntity,
        @Res({ passthrough: true }) res: Response,
    ): Promise<FpayResponse<PaymentResponseDto> | any> {
        try {
            // ✅ Utiliser l'utilisateur authentifié
            let userToUse = user;

            // ✅ Vérifier que l'utilisateur est authentifié
            if (!userToUse) {
                throw new HttpException('Utilisateur non authentifié', HttpStatus.UNAUTHORIZED);
            }

            // ✅ Vérifier si l'utilisateur a un userIdFpay
            if (!userToUse.userIdFpay || !userToUse.isLink) {
                this.logger.warn(`⚠️ Utilisateur ${userToUse.id} non lié à FPay`);

                // ✅ Récupérer l'API Key depuis le service
                const apiKey = this.fpayService.getApiKey();

                // ✅ Construire l'URL OAuth avec system_user_id et les données de paiement
                const fpayUrl = process.env.FPAY_API_URL || 'https://f-pay.favorhelp.com';
                const appUrl = process.env.APP_URL || 'http://localhost:3000';
                const authCode = crypto.randomBytes(32).toString('hex');
                const clientId = 'web-client';
                const callbackUrl = `${appUrl}/oauth/callback`;

                const redirectUrl = new URL(`${fpayUrl}/oauth/login`);
                redirectUrl.searchParams.set('client_id', clientId);
                redirectUrl.searchParams.set('code', authCode);
                redirectUrl.searchParams.set('system_user_id', userToUse.id);
                redirectUrl.searchParams.set('redirect_uri', callbackUrl);

                // ✅ AJOUTER les données de paiement dans l'URL
                redirectUrl.searchParams.set('amount', paymentDto.amount.toString());
                redirectUrl.searchParams.set('currency', paymentDto.currency);
                // ✅ AJOUTER l'API Key dans l'URL
                redirectUrl.searchParams.set('api_key', apiKey);
                if (paymentDto.description) {
                    redirectUrl.searchParams.set('description', paymentDto.description);
                }

                this.logger.log(`🔗 Redirection OAuth: ${redirectUrl.toString()}`);

                // ✅ Retourner l'URL OAuth
                return {
                    status: 'redirect',
                    message: 'Authentification FPay requise. Veuillez vous connecter.',
                    redirectUrl: redirectUrl.toString(),
                    openInBrowser: redirectUrl.toString(),
                    system_user_id: userToUse.id,
                    paymentData: {
                        amount: paymentDto.amount,
                        currency: paymentDto.currency,
                        description: paymentDto.description,
                    }
                };
            }

            // ✅ Ajouter automatiquement system_user_id au DTO pour le service
            const paymentDataWithUser = {
                ...paymentDto,
                system_user_id: userToUse.id,
            };

            // ✅ L'utilisateur est lié, effectuer le paiement
            return this.fpayService.makePayment(paymentDataWithUser, userToUse);

        } catch (error) {
            this.logger.error(`❌ Erreur paiement: ${error.message}`);

            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                {
                    status: 'error',
                    message: error.message || 'Erreur lors du paiement',
                },
                HttpStatus.BAD_REQUEST,
            );
        }
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