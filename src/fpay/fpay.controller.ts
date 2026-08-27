// src/modules/fpay/fpay.controller.ts
import {
    Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards,
    Query, Res, Ip, Logger,
    HttpException,
    Headers
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

            if (!body.systemUserId) {
                console.error('[Favor Help] ❌ systemUserId manquant !');
                return res.status(400).json({
                    success: false,
                    message: 'systemUserId est requis',
                });
            }

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

    // ============================================================
    // 2. LIAISON DIRECTE AVEC ACCESS_TOKEN (NOUVEAU)
    // ============================================================
    @Post('link-with-token')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Lier un compte FPay avec un access_token',
        description: 'Permet de lier un compte FPay en utilisant un access_token existant'
    })
    async linkWithToken(
        @Body() body: {
            access_token: string;
            refresh_token?: string;
        },
        @CurrentUser() user: UserEntity,
        @Res() res: Response,
    ): Promise<any> {
        try {
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Utilisateur non authentifié',
                });
            }

            if (!body.access_token) {
                return res.status(400).json({
                    success: false,
                    message: 'access_token est requis pour la liaison',
                });
            }

            this.logger.log(`🔗 Liaison avec token pour l'utilisateur: ${user.id}`);

            const result = await this.fpayService.linkUserWithToken(
                body.access_token,
                user.id,
                body.refresh_token,
            );

            if (!result.success) {
                return res.status(400).json(result);
            }

            return res.status(200).json(result);

        } catch (error) {
            this.logger.error(`❌ Erreur: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: error.message || 'Erreur lors de la liaison',
            });
        }
    }

    // ============================================================
    // 3. AUTHENTIFICATION (login)
    // ============================================================
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

            // ✅ Si pas de phone/password → Rediriger vers FPay
            if (!authDto || !authDto.phone || !authDto.password) {
                const fpayUrl = this.fpayService.getFpayApiUrl() || 'https://f-pay.favorhelp.com';
                const authCode = crypto.randomBytes(32).toString('hex');
                const clientId = authDto?.clientId || 'web-client';
                const callbackUrl = process.env.OAUTH_CALLBACK_URL || `${this.fpayService.getFpayApiUrl()}/oauth/callback`;

                const redirectUrl = new URL(`${fpayUrl}/oauth/login`);
                redirectUrl.searchParams.set('client_id', clientId);
                redirectUrl.searchParams.set('code', authCode);
                redirectUrl.searchParams.set('system_user_id', systemUserId);
                redirectUrl.searchParams.set('redirect_uri', callbackUrl);

                this.logger.log(`🔗 URL OAuth FPay: ${redirectUrl.toString()}`);

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
                const fpayUrl = this.fpayService.getFpayApiUrl() || 'https://f-pay.favorhelp.com';
                const authCode = crypto.randomBytes(32).toString('hex');
                const clientId = authDto.clientId || 'web-client';
                const callbackUrl = process.env.OAUTH_CALLBACK_URL || `${fpayUrl}/oauth/callback`;

                const redirectUrl = new URL(`${fpayUrl}/oauth/login`);
                redirectUrl.searchParams.set('client_id', clientId);
                redirectUrl.searchParams.set('code', authCode);
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
    // 4. PAIEMENT
    // ============================================================
    // src/modules/fpay/fpay.controller.ts

    @Post('pay')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    async makePayment(
        @Body() paymentDto: FpayPaymentDto,
        @CurrentUser() user: UserEntity,
    ): Promise<FpayResponse<PaymentResponseDto>> {
        try {
            if (!user) {
                throw new HttpException('Utilisateur non authentifié', HttpStatus.UNAUTHORIZED);
            }

            // ✅ NE PAS ajouter system_user_id - le service le gère via le token
            // const paymentData = {
            //     ...paymentDto,
            //     system_user_id: user.id,  // ❌ À SUPPRIMER
            // };

            // ✅ Appeler directement le service avec le DTO
            return await this.fpayService.makePayment(paymentDto, user);

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

    @Post('pay/mobile-money')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Paiement via Mobile Money',
        description: 'Effectue un paiement via Mobile Money en utilisant l\'API Key'
    })
    async payWithMobileMoney(
        @Body() body: {
            amount: number;
            currency?: string;
            description?: string;
            paymentMethod?: string;
        },
        @CurrentUser() user: UserEntity,
        @Ip() ipAddress: string,
        @Headers('lang') langHeader?: string,
    ): Promise<any> {
        try {
            if (!user) {
                throw new HttpException('Utilisateur non authentifié', HttpStatus.UNAUTHORIZED);
            }

            if (!body.amount || body.amount <= 0) {
                throw new HttpException(
                    'Le montant doit être supérieur à 0',
                    HttpStatus.BAD_REQUEST,
                );
            }

            const lang = langHeader || 'fr';

            this.logger.log(`📱 Paiement Mobile Money par l'utilisateur: ${user.id}`);

            return await this.fpayService.payWithMobileMoney(
                body.amount,
                body.currency || 'CDF',
                body.description || `Paiement Mobile Money`,
                body.paymentMethod || 'MOBILE_MONEY',
                ipAddress,
                lang,
            );

        } catch (error) {
            this.logger.error(`❌ Erreur paiement Mobile Money: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                {
                    status: 'error',
                    message: error.message || 'Erreur lors du paiement Mobile Money',
                },
                HttpStatus.BAD_REQUEST,
            );
        }
    }
    // ============================================================
    // 5. ENVOI (LOGISTIC)
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
    // 6. WALLET BALANCE & TRANSACTIONS
    // ============================================================
    @Get('wallet/balance-transactions')
    @UseGuards(AuthentificationGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Récupérer la balance et les transactions du wallet',
        description: 'Récupère la balance et les transactions du wallet de l\'utilisateur connecté'
    })
    async getWalletBalanceAndTransactions(
        @CurrentUser() user: UserEntity,
        @Query('walletId') walletId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('type') type?: string,
        @Query('status') status?: string,
        @Query('movement') movement?: string,
        @Query('search') search?: string,
    ) {
        if (!user) {
            throw new HttpException('Utilisateur non authentifié', HttpStatus.UNAUTHORIZED);
        }

        if (!user.userIdFpay) {
            throw new HttpException(
                'Vous devez d\'abord lier votre compte FPay',
                HttpStatus.BAD_REQUEST,
            );
        }

        this.logger.log(`📊 Récupération balance/transactions pour l'utilisateur: ${user.id}`);

        const pageNum = page ? parseInt(page, 10) : 1;
        const limitNum = limit ? parseInt(limit, 10) : 10;

        return this.fpayService.getWalletBalanceAndTransactions(
            user.userIdFpay,
            walletId,
            pageNum,
            limitNum,
            startDate,
            endDate,
            type,
            status,
            movement,
            search,
        );
    }

    @Get('open')
    @UseGuards(AuthentificationGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Ouvrir la page OAuth FPay',
        description: 'Génère l\'URL de redirection vers la page de connexion FPay'
    })
    async openOAuthPage(
        @Res() res: Response,
        @CurrentUser() user: UserEntity,
        @Query('client_id') clientId?: string,  // ✅ AJOUT
        @Query('amount') amount?: string,
        @Query('currency') currency?: string,
        @Query('description') description?: string,
        @Query('redirect_uri') redirectUri?: string,  // ✅ AJOUT
    ) {
        try {
            if (!user) {
                throw new HttpException('Utilisateur non authentifié', HttpStatus.UNAUTHORIZED);
            }

            const fpayUrl = this.fpayService.getFpayApiUrl() || 'https://f-pay.favorhelp.com';
            const appUrl = process.env.APP_URL || 'http://localhost:3000';
            const authCode = crypto.randomBytes(32).toString('hex');

            // ✅ Utiliser le client_id fourni ou 'web-client' par défaut
            const finalClientId = clientId || 'web-client';

            // ✅ Utiliser le redirect_uri fourni ou construire par défaut
            let callbackUrl = redirectUri;
            if (!callbackUrl) {
                if (finalClientId === 'mobile-client' || finalClientId?.includes('mobile')) {
                    callbackUrl = process.env.MOBILE_CALLBACK_URL || 'fpay://callback';
                } else {
                    callbackUrl = `${appUrl}/oauth/callback`;
                }
            }

            const redirectUrl = new URL(`${fpayUrl}/oauth/login`);
            redirectUrl.searchParams.set('client_id', finalClientId);
            redirectUrl.searchParams.set('code', authCode);
            redirectUrl.searchParams.set('system_user_id', user.id);
            redirectUrl.searchParams.set('redirect_uri', callbackUrl);

            if (amount) {
                redirectUrl.searchParams.set('amount', amount);
            }
            if (currency) {
                redirectUrl.searchParams.set('currency', currency);
            }
            if (description) {
                redirectUrl.searchParams.set('description', description);
            }

            this.logger.log(`🔗 URL OAuth FPay (client_id: ${finalClientId}): ${redirectUrl.toString()}`);

            return res.json({
                status: 'success',
                message: 'Page OAuth FPay',
                url: redirectUrl.toString(),
                openInBrowser: redirectUrl.toString(),
                client_id: finalClientId,
                redirect_uri: callbackUrl,
            });

        } catch (error) {
            this.logger.error(`❌ Erreur: ${error.message}`);
            throw new HttpException(
                error.message || 'Erreur lors de l\'ouverture de la page OAuth',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
    // ============================================================
    // 7. PROCESSUS COMPLET
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