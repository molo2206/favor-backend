// src/modules/fpay/fpay.service.ts
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { FpayPaymentDto } from './dto/payment.dto';
import { FpaySendDto } from './dto/send.dto';
import { FpayResponse, PaymentResponseDto } from './dto/response.dto';
import * as crypto from 'crypto';
import { AuthLoginDto } from './dto/link-user.dto';

export interface WalletBalanceResponse {
    success: boolean;
    message: string;
    data: {
        wallet: {
            id: string;
            userId: string;
            balance: number;
            currency: string;
            isActive: boolean;
            createdAt: string;
            updatedAt: string;
        };
        balance: number;
        currency: string;
        transactions: {
            data: any[];
            total: number;
            page: number;
            limit: number;
            analytics: {
                totalCredit: number;
                totalDebit: number;
                totalTransactions: number;
            };
        };
        stats: {
            totalSent: number;
            totalReceived: number;
            averageTransaction: number;
            largestTransaction: number;
            smallestTransaction: number;
            transactionCount: number;
        };
    };
}

// ✅ Interface pour la réponse de link-user
interface LinkUserResponse {
    accessToken: string;
    refreshToken: string;
    message: string;
    sessionId?: string;
    oauthRedirectUrl?: string;
    requiresOtp?: boolean;
    data: {
        id: string;
        email: string | null;
        phone: string | null;
        full_name: string | null;
        role: string;
        status: string;
        profileImage: string | null;
        kycStatus: string;
        countryCode: string | null;
        accessToken: string;
        refreshToken: string;
        tokenType: string;
        expiresIn: number;
        [key: string]: any;
    };
}

@Injectable()
export class FpayService {
    private readonly logger = new Logger(FpayService.name);
    private readonly fpayApiUrl: string;
    private readonly apiKey: string;
    private readonly logisticApiKey: string;
    private readonly appUrl: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,
    ) {
        const fpayApiUrl = this.configService.get<string>('FPAY_API_URL');
        const apiKey = this.configService.get<string>('FPAY_API_KEY_HELP');
        const logisticApiKey = this.configService.get<string>('FPAY_API_KEY_LOGISTIC');
        const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';

        if (!fpayApiUrl) {
            throw new Error('FPAY_API_URL is not defined in environment variables');
        }
        if (!apiKey) {
            throw new Error('FPAY_API_KEY_HELP is not defined in environment variables');
        }
        if (!logisticApiKey) {
            throw new Error('FPAY_API_KEY_LOGISTIC is not defined in environment variables');
        }

        this.fpayApiUrl = fpayApiUrl;
        this.apiKey = apiKey;
        this.logisticApiKey = logisticApiKey;
        this.appUrl = appUrl;
    }

    private getHeaders() {
        return {
            'Authorization': this.apiKey,
            'Content-Type': 'application/json',
        };
    }

    private getLogisticHeaders() {
        return {
            'Authorization': this.logisticApiKey,
            'Content-Type': 'application/json',
        };
    }

    // ============================================================
    // 1. AUTHENTIFICATION EN 2 ÉTAPES (AVEC OTP)
    // ============================================================

    async login(
        authDto: AuthLoginDto,
        systemUserId?: string
    ): Promise<any> {
        try {
            const url = `${this.fpayApiUrl}/auth/link-user`;
            const hasOtp = authDto.otpCode && authDto.otpCode.trim() !== '';

            this.logger.log(`🔐 Authentification: ${authDto.phone}, hasOtp: ${hasOtp}`);

            // ============================================================
            // ÉTAPE 1 : Vérifier les identifiants et envoyer OTP
            // ============================================================
            if (!hasOtp) {
                this.logger.log(`📱 ÉTAPE 1 - Vérification des identifiants pour ${authDto.phone}`);

                // ✅ Appel pour vérifier les identifiants
                const authResponse = await firstValueFrom(
                    this.httpService.post<any>(
                        url,
                        {
                            phone: authDto.phone,
                            password: authDto.password,
                        },
                        { headers: this.getHeaders() }
                    )
                );

                this.logger.log(`✅ Identifiants valides pour ${authDto.phone}`);

                // ✅ Retourner que l'OTP a été envoyé
                return {
                    success: true,
                    requiresOtp: true,
                    message: authResponse.data.message || 'Code OTP envoyé avec succès',
                    data: null
                };
            }

            // ============================================================
            // ÉTAPE 2 : Vérifier l'OTP et générer les tokens
            // ============================================================
            this.logger.log(`🔐 ÉTAPE 2 - Vérification OTP pour ${authDto.phone}`);

            const response = await firstValueFrom(
                this.httpService.post<any>(
                    url,
                    authDto,  // ✅ Contient phone, password, otpCode
                    { headers: this.getHeaders() }
                )
            );

            this.logger.log(`✅ OTP vérifié avec succès pour ${authDto.phone}`);

            // ✅ Sauvegarde du userIdFpay (LE LIEN)
            if (systemUserId && response.data?.data?.id) {
                await this.saveFpayUserId(systemUserId, response.data.data.id);
                this.logger.log(`🔗 Compte FPay lié à l'utilisateur ${systemUserId}`);
            }

            return {
                success: true,
                message: response.data.message || 'Connexion réussie',
                data: response.data.data,
                accessToken: response.data.accessToken,
                refreshToken: response.data.refreshToken,
                requiresOtp: false,
                isLinked: true,
            };

        } catch (error) {
            this.logger.error(`❌ Erreur d'authentification: ${error.message}`);

            return {
                success: false,
                message: error.response?.data?.message || error.message || 'Erreur d\'authentification',
                error: error.response?.data || null
            };
        }
    }

    // ============================================================
    // 2. SAUVEGARDE DU userIdFpay (LE LIEN)
    // ============================================================

    async saveFpayUserId(systemUserId: string, fpayUserId: string): Promise<void> {
        try {
            console.log(`[saveFpayUserId] systemUserId: ${systemUserId}`);
            console.log(`[saveFpayUserId] fpayUserId: ${fpayUserId}`);

            // ✅ Vérifier que les IDs ne sont pas vides
            if (!systemUserId || !fpayUserId) {
                throw new Error('systemUserId ou fpayUserId est vide');
            }

            const result = await this.userRepository.update(
                { id: systemUserId },
                {
                    userIdFpay: fpayUserId,
                    isLink: true,
                }
            );

            console.log(`[saveFpayUserId] Result:`, result);
            console.log(`✅ userIdFpay ${fpayUserId} sauvegardé pour l'utilisateur ${systemUserId}`);
        } catch (error) {
            console.error(`❌ Erreur lors de la sauvegarde:`, error.message);
            throw error;  // ✅ Propager l'erreur
        }
    }

    async findUserById(systemUserId: string): Promise<UserEntity | null> {
        try {
            return await this.userRepository.findOne({
                where: { id: systemUserId },
            });
        } catch (error) {
            this.logger.error(`❌ Erreur lors de la recherche de l'utilisateur: ${error.message}`);
            return null;
        }
    }

    async unlinkFpayUser(systemUserId: string): Promise<{ success: boolean; message: string }> {
        try {
            this.logger.log(`🔓 Tentative de déliaison pour l'utilisateur ${systemUserId}`);

            // Vérifier si l'utilisateur existe
            const user = await this.userRepository.findOne({
                where: { id: systemUserId },
            });

            if (!user) {
                throw new HttpException(
                    'Utilisateur non trouvé',
                    HttpStatus.NOT_FOUND,
                );
            }

            // Vérifier si l'utilisateur est déjà délié
            if (!user.userIdFpay || user.isLink === false) {
                throw new HttpException(
                    'Ce compte Favor Help n\'est pas lié à un compte FPay',
                    HttpStatus.BAD_REQUEST,
                );
            }

            // ✅ Option 1: Supprimer complètement le userIdFpay
            const result = await this.userRepository.update(
                { id: systemUserId },
                {
                    userIdFpay: "",
                    isLink: false,
                }
            );

            if (result.affected === 0) {
                throw new HttpException(
                    'Impossible de mettre à jour l\'utilisateur',
                    HttpStatus.INTERNAL_SERVER_ERROR,
                );
            }

            this.logger.log(`✅ Compte FPay délié avec succès pour l'utilisateur ${systemUserId}`);

            return {
                success: true,
                message: 'Compte FPay délié avec succès',
            };

        } catch (error) {
            this.logger.error(`❌ Erreur lors de la déliaison: ${error.message}`);

            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException(
                {
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    message: error.message || 'Erreur lors de la déliaison du compte',
                    timestamp: new Date().toISOString(),
                },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
    // ============================================================
    // 3. PAIEMENT
    // ============================================================
    async makePayment(
        paymentDto: FpayPaymentDto & { system_user_id?: string },
        currentUser: UserEntity,
    ): Promise<FpayResponse<PaymentResponseDto>> {
        try {
            if (!currentUser) {
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }

            let user = currentUser;

            // ✅ Si system_user_id est fourni, l'utiliser (sinon utiliser currentUser)
            if (paymentDto.system_user_id) {
                const systemUser = await this.userRepository.findOne({
                    where: { id: paymentDto.system_user_id },
                });

                if (!systemUser) {
                    throw new HttpException(
                        `Utilisateur avec system_user_id ${paymentDto.system_user_id} non trouvé`,
                        HttpStatus.NOT_FOUND,
                    );
                }

                user = systemUser;
                this.logger.log(`✅ Payeur récupéré via system_user_id: ${user.id}`);
            }

            // ✅ Vérifier que l'utilisateur a un userIdFpay
            if (!user.userIdFpay || !user.isLink) {
                this.logger.error(`❌ Payeur ${user.id} n'a pas de compte FPAY lié`);

                throw new HttpException(
                    'Vous devez d\'abord lier votre compte FPAY. Veuillez vous connecter via OAuth.',
                    HttpStatus.BAD_REQUEST,
                );
            }

            // ✅ Extraire le destinataire de l'API Key
            let cleanApiKey = this.apiKey;
            if (cleanApiKey.startsWith('Bearer ')) {
                cleanApiKey = cleanApiKey.substring(7);
            }

            let recipientPhoneOrCode: string | null = null;

            try {
                const apiKeyParts = cleanApiKey.split('.');
                if (apiKeyParts.length === 3) {
                    const payloadJson = Buffer.from(apiKeyParts[1], 'base64').toString('utf-8');
                    const payload = JSON.parse(payloadJson);
                    recipientPhoneOrCode = payload.phone || payload.merchantCode || payload.sub;
                }
            } catch (error) {
                this.logger.error(`❌ Erreur lors du décodage de l'API Key: ${error.message}`);
            }

            if (!recipientPhoneOrCode) {
                throw new HttpException(
                    'Impossible d\'extraire le destinataire de l\'API Key',
                    HttpStatus.BAD_REQUEST,
                );
            }

            if (user.phone === recipientPhoneOrCode) {
                throw new HttpException(
                    'Vous ne pouvez pas vous payer vous-même',
                    HttpStatus.BAD_REQUEST,
                );
            }

            this.logger.log(`💰 Paiement: ${user.phone} → ${recipientPhoneOrCode}`);

            const url = `${this.fpayApiUrl}/api/external/pay`;
            const paymentData = {
                system_user_id: user.id,
                toPhoneOrCode: recipientPhoneOrCode,
                amount: paymentDto.amount,
                currency: paymentDto.currency || 'USD',
                description: paymentDto.description || `Paiement vers ${recipientPhoneOrCode}`,
            };

            // ✅ Préparer les headers avec l'API Key
            const headers = {
                'Authorization': this.apiKey, // ✅ Ajouter l'API Key dans les headers
                'Content-Type': 'application/json',
            };

            const response = await firstValueFrom(
                this.httpService.post<FpayResponse<PaymentResponseDto>>(
                    url,
                    paymentData,
                    { headers: headers } // ✅ Utiliser les headers avec l'API Key
                )
            );

            this.logger.log(`✅ Paiement réussi: ${response.data.data.transaction.reference}`);
            return response.data;

        } catch (error) {
            this.logger.error(`❌ Erreur de paiement: ${error.message}`);
            throw this.handleError(error);
        }
    }
    // ============================================================
    // 4. ENVOI (LOGISTIC)
    // ============================================================

    async makeSend(
        sendDto: FpaySendDto,
        currentUser: UserEntity,
    ): Promise<FpayResponse<PaymentResponseDto>> {
        try {
            if (!currentUser) {
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }

            let cleanApiKey = this.logisticApiKey;
            if (cleanApiKey.startsWith('Bearer ')) {
                cleanApiKey = cleanApiKey.substring(7);
            }

            let recipientPhoneOrCode: string | null = null;

            try {
                const apiKeyParts = cleanApiKey.split('.');
                if (apiKeyParts.length === 3) {
                    const payloadJson = Buffer.from(apiKeyParts[1], 'base64').toString('utf-8');
                    const payload = JSON.parse(payloadJson);
                    recipientPhoneOrCode = payload.phone || payload.sub;
                }
            } catch (error) {
                this.logger.error(`❌ Erreur lors du décodage de l'API Key LOGISTIC: ${error.message}`);
            }

            if (!recipientPhoneOrCode) {
                throw new HttpException(
                    'Impossible d\'extraire le destinataire de l\'API Key LOGISTIC',
                    HttpStatus.BAD_REQUEST,
                );
            }

            const client = await this.userRepository.findOne({
                where: { userIdFpay: sendDto.userId },
            });

            if (!client) {
                throw new HttpException(
                    `Client avec l'ID ${sendDto.userId} non trouvé`,
                    HttpStatus.NOT_FOUND,
                );
            }

            if (!client.userIdFpay) {
                throw new HttpException(
                    'Le client n\'a pas de compte FPay lié',
                    HttpStatus.BAD_REQUEST,
                );
            }

            if (client.phone === recipientPhoneOrCode) {
                throw new HttpException(
                    'Vous ne pouvez pas vous envoyer d\'argent à vous-même',
                    HttpStatus.BAD_REQUEST,
                );
            }

            this.logger.log(`📤 Envoi LOGISTIC: ${client.phone} → ${recipientPhoneOrCode}`);

            const url = `${this.fpayApiUrl}/api/external/send`;
            const sendData = {
                userId: sendDto.userId,
                amount: sendDto.amount,
                description: sendDto.description || `Envoi vers ${recipientPhoneOrCode}`,
                currency: sendDto.currency || 'USD',
                countryCode: sendDto.countryCode || 'CD',
            };

            const response = await firstValueFrom(
                this.httpService.post<FpayResponse<PaymentResponseDto>>(
                    url,
                    sendData,
                    { headers: this.getLogisticHeaders() }
                )
            );

            this.logger.log(`✅ Envoi LOGISTIC réussi: ${response.data.data.transaction.reference}`);
            return response.data;

        } catch (error) {
            this.logger.error(`❌ Erreur d'envoi LOGISTIC: ${error.message}`);
            throw this.handleError(error);
        }
    }

    /**
     * Récupère la balance et les transactions d'un wallet
     */
    async getWalletBalanceAndTransactions(
        userId: string,  // userIdFpay
        walletId?: string,  // ✅ Optionnel
        page: number = 1,
        limit: number = 10,
        startDate?: string,
        endDate?: string,
        type?: string,
        status?: string,
        movement?: string,
        search?: string,
    ): Promise<any> {
        try {
            this.logger.log(`📊 Récupération balance/transactions: userIdFpay=${userId}, walletId=${walletId || 'non fourni'}`);

            // ✅ Construire l'URL
            const url = `${this.fpayApiUrl}/wallet/balance-transactions`;

            // ✅ Construire les paramètres de requête
            const params = new URLSearchParams();
            params.set('userId', userId);  // userIdFpay

            // ✅ Ne pas ajouter walletId s'il est vide ou undefined
            if (walletId && walletId.trim() !== '') {
                params.set('walletId', walletId);
            }

            params.set('page', page.toString());
            params.set('limit', limit.toString());

            if (startDate) params.set('startDate', startDate);
            if (endDate) params.set('endDate', endDate);
            if (type) params.set('type', type);
            if (status) params.set('status', status);
            if (movement) params.set('movement', movement);
            if (search) params.set('search', search);

            const fullUrl = `${url}?${params.toString()}`;

            this.logger.log(`🔗 Appel API: ${fullUrl}`);

            // ✅ Appel HTTP
            const response = await firstValueFrom(
                this.httpService.get(
                    fullUrl,
                    { headers: this.getHeaders() }
                )
            );

            this.logger.log(`✅ Balance et transactions récupérées avec succès`);

            return response.data;

        } catch (error) {
            this.logger.error(`❌ Erreur: ${error.message}`);

            if (error.response) {
                this.logger.error(`📦 Réponse erreur: ${JSON.stringify(error.response.data)}`);
            }

            throw this.handleError(error);
        }
    }

    getApiKey(): string {
        return this.apiKey;
    }
    // ============================================================
    // 5. PROCESSUS COMPLET
    // ============================================================

    async processFullPayment(
        authDto: AuthLoginDto,
        paymentDto: FpayPaymentDto,
        currentUser: UserEntity
    ): Promise<{
        auth: any;
        payment: FpayResponse<PaymentResponseDto>;
    }> {
        try {
            const authResult = await this.login(authDto, currentUser.id);

            if (!authResult.success) {
                throw new HttpException(
                    authResult.message || 'Authentication failed',
                    HttpStatus.UNAUTHORIZED,
                );
            }

            const paymentResult = await this.makePayment(paymentDto, currentUser);

            return {
                auth: authResult,
                payment: paymentResult,
            };
        } catch (error) {
            this.logger.error(`❌ Erreur lors du traitement complet: ${error.message}`);
            throw error;
        }
    }

    // ============================================================
    // 6. GESTION DES ERREURS
    // ============================================================

    private handleError(error: any): HttpException {
        if (error.response) {
            const status = error.response.status || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = error.response.data?.message || 'FPAY API error';

            this.logger.error(`❌ FPAY API Error: ${status} - ${message}`);

            return new HttpException(
                {
                    statusCode: status,
                    message: message,
                    error: error.response.data,
                    timestamp: new Date().toISOString(),
                },
                status,
            );
        }

        if (error.request) {
            this.logger.error('❌ Service FPay indisponible');
            return new HttpException(
                {
                    statusCode: HttpStatus.SERVICE_UNAVAILABLE,
                    message: 'Service FPay indisponible',
                    timestamp: new Date().toISOString(),
                },
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }

        return new HttpException(
            {
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                message: error.message || 'Erreur interne',
                timestamp: new Date().toISOString(),
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
        );
    }


}