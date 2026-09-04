// src/modules/fpay/fpay.service.ts
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { FpaySendDto } from './dto/send.dto';
import { FpayResponse, PaymentResponseDto } from './dto/response.dto';
import * as crypto from 'crypto';
import { AuthLoginDto } from './dto/link-user.dto';
import * as jwt from 'jsonwebtoken';
import { FpayPaymentDto } from './dto/payment.dto';
import { JwtService } from '@nestjs/jwt';
import { OtpEntity } from 'src/otp/entities/otp.entity';
import { Validator } from 'class-validator';
import { MailService } from 'src/email/email.service';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { I18nService } from 'src/libs/common/src';

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

export interface DepositRequestDto {
    userId: string;
    amount: number;
    currency: string;
}

export interface DepositRequestResponse {
    message: string;
    data: {
        transaction: {
            id: string;
            userId: string;
            walletId: string;
            amount: number;
            type: string;
            status: string;
            reference: string;
            description: string;
            movement: string;
            currency: string;
            createdAt: string;
            updatedAt: string;
        };
        wallet: {
            id: string;
            userId: string;
            balance: number;
            currency: string;
            isActive: boolean;
            createdAt: string;
            updatedAt: string;
        };
        requiresValidation: boolean;
    };
}


@Injectable()
export class FpayService {
    private readonly logger = new Logger(FpayService.name);
    private readonly fpayApiUrl: string;
    private readonly apiKey: string;
    private readonly logisticApiKey: string;
    private readonly parrainageApiKey: string;
    private readonly fideliteApiKey: string;
    private readonly appUrl: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,

        @InjectRepository(OtpEntity)
        private readonly otpRepository: Repository<OtpEntity>,
        private readonly smsHelper: SmsHelper,
        private readonly mailService: MailService,
        private readonly jwtService: JwtService,
    ) {
        const fpayApiUrl = this.configService.get<string>('FPAY_API_URL');
        const apiKey = this.configService.get<string>('FPAY_API_KEY_HELP');
        const parrainageApiKey = this.configService.get<string>('FPAY_API_KEY_PARRAINAGE');
        const logisticApiKey = this.configService.get<string>('FPAY_API_KEY_LOGISTIC');
        const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';

        const fideliteApiKey = this.configService.get<string>('FPAY_API_KEY_FIDELITE');


        if (!fpayApiUrl) {
            throw new Error('FPAY_API_URL is not defined in environment variables');
        }
        if (!apiKey) {
            throw new Error('FPAY_API_KEY_HELP is not defined in environment variables');
        }
        if (!logisticApiKey) {
            throw new Error('FPAY_API_KEY_LOGISTIC is not defined in environment variables');
        }

        if (!parrainageApiKey) {
            throw new Error('FPAY_API_KEY_PARRAINAGE is not defined in environment variables');
        }

        if (!fideliteApiKey) {
            throw new Error('FPAY_API_KEY_FIDELITE is not defined in environment variables');
        }

        this.fpayApiUrl = fpayApiUrl;
        this.apiKey = apiKey;
        this.logisticApiKey = logisticApiKey;
        this.appUrl = appUrl;
        this.parrainageApiKey = parrainageApiKey;
        this.fideliteApiKey = fideliteApiKey;
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

    async login(
        authDto: AuthLoginDto,
        systemUserId?: string
    ): Promise<any> {
        try {
            const url = `${this.fpayApiUrl}/auth/login`;  // ✅ Changé de /auth/link-user à /auth/login
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
                            clientId: authDto.clientId || 'web-client',
                            redirectUri: authDto.redirectUri || `${this.appUrl}/oauth/callback`,
                            lang: authDto.lang || 'fr',
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
                    {
                        phone: authDto.phone,
                        password: authDto.password,
                        otpCode: authDto.otpCode,
                        clientId: authDto.clientId || 'web-client',
                        redirectUri: authDto.redirectUri || `${this.appUrl}/oauth/callback`,
                        lang: authDto.lang || 'fr',
                    },
                    { headers: this.getHeaders() }
                )
            );

            this.logger.log(`✅ OTP vérifié avec succès pour ${authDto.phone}`);

            // ✅ Sauvegarde du userIdFpay (LE LIEN) - UNIQUEMENT si on a systemUserId
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

    async linkUserWithToken(
        accessToken: string,
        systemUserId: string,
        refreshToken?: string,
    ): Promise<{ success: boolean; message: string; data?: any; access_token?: string; refresh_token?: string }> {
        try {
            this.logger.log(`🔗 Liaison directe pour systemUserId: ${systemUserId}`);

            if (!accessToken) {
                throw new Error('access_token est requis pour la liaison');
            }

            if (!systemUserId) {
                throw new Error('system_user_id est requis pour la liaison');
            }

            const response = await fetch(`${this.fpayApiUrl}/auth/link-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    access_token: accessToken,
                    refresh_token: refreshToken || null,
                    system_user_id: systemUserId,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Erreur API: ${response.status}`);
            }

            const data = await response.json();

            this.logger.log(`✅ Comptes liés avec succès pour ${systemUserId}`);

            // ✅ Récupérer l'utilisateur avec toutes les relations (comme dans le login)
            const user = await this.userRepository
                .createQueryBuilder('users')
                .leftJoinAndSelect('users.userHasCompany', 'userHasCompany')
                .leftJoinAndSelect('userHasCompany.company', 'company')
                .leftJoinAndSelect('userHasCompany.branch', 'userHasCompanyBranch')
                .leftJoinAndSelect('company.tauxCompanies', 'tauxCompanies')
                .leftJoinAndSelect('company.country', 'country')
                .leftJoinAndSelect('company.city', 'city')
                .leftJoinAndSelect('company.category', 'category')
                .leftJoinAndSelect('company.companyResources', 'companyResources')
                .leftJoinAndSelect('companyResources.resource', 'resource')
                .leftJoinAndSelect('company.branches', 'branches')
                .leftJoinAndSelect('users.userPlatformRoles', 'userPlatformRoles')
                .leftJoinAndSelect('userPlatformRoles.platform', 'platform')
                .leftJoinAndSelect('userPlatformRoles.role', 'role')
                .leftJoinAndSelect('users.defaultAddress', 'defaultAddress')
                .leftJoinAndSelect('userHasCompany.resources', 'userCompanyResources')
                .leftJoinAndSelect('userCompanyResources.resource', 'userCompanyResourceDetail')
                .leftJoinAndSelect('users.activeBranch', 'activeBranch')
                .leftJoinAndSelect('activeBranch.country', 'activeBranchCountry')
                .leftJoinAndSelect('activeBranch.city', 'activeBranchCity')
                .leftJoinAndSelect('users.loyalty', 'loyalty')
                .where('users.id = :id', { id: systemUserId })
                .getOne();

            if (!user) {
                throw new Error(`Utilisateur ${systemUserId} non trouvé`);
            }

            // ✅ Mettre à jour userIdFpay et isLink
            const fpayUserId = data.data?.fpayUserId || data.data?.id;
            await this.saveFpayUserId(systemUserId, fpayUserId);

            // ✅ Générer les tokens comme dans le login
            const access_token = await this.accessToken(user);
            const refresh_token = await this.refreshToken(user);

            // ✅ Construire la même structure que le login
            const loyaltyPoints = user.loyalty?.[0]?.pointsBalance ?? 0;
            const loyaltyTier = user.loyalty?.[0]?.currentTier ?? null;
            const loyaltyCode = user.loyalty?.[0]?.loyaltyCode ?? null;

            const { password, ...userWithoutPassword } = user;

            return {
                success: true,
                message: data.message || 'Compte lié avec succès',
                access_token: access_token,
                refresh_token: refresh_token,
                data: {
                    ...userWithoutPassword,
                    loyalty: {
                        points: loyaltyPoints,
                        tier: loyaltyTier,
                        code: loyaltyCode,
                    },
                    userIdFpay: fpayUserId,
                    isLink: true,
                }
            };

        } catch (error) {
            this.logger.error(`❌ Erreur de liaison: ${error.message}`);
            return {
                success: false,
                message: error.message || 'Erreur lors de la liaison',
            };
        }
    }

    async saveFpayUserId(systemUserId: string, fpayUserId: string): Promise<void> {
        try {
            console.log(`[saveFpayUserId] systemUserId: ${systemUserId}`);
            console.log(`[saveFpayUserId] fpayUserId: ${fpayUserId}`);

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
            throw error;
        }
    }


    async accessToken(user: UserEntity): Promise<string> {
        const payload = {
            id: user.id,
            email: user.email,
            role: user.role,
        };

        const secretKey = this.configService.get<string>('ACCESS_TOKEN_SECRET_KEY');
        if (!secretKey) {
            throw new Error('ACCESS_TOKEN_SECRET_KEY is not defined!');
        }

        return await this.jwtService.signAsync(payload, {
            expiresIn: '48h',
            secret: secretKey,
        });
    }

    async refreshToken(user: UserEntity): Promise<string> {
        const payload = {
            id: user.id,
            email: user.email,
            role: user.role,
        };

        const secretKey = this.configService.get<string>('REFRESH_TOKEN_SECRET_KEY');
        if (!secretKey) {
            throw new Error('REFRESH_TOKEN_SECRET_KEY is not defined!');
        }

        return await this.jwtService.signAsync(payload, {
            expiresIn: '7d',
            secret: secretKey,
        });
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

            const user = await this.userRepository.findOne({
                where: { id: systemUserId },
            });

            if (!user) {
                throw new HttpException(
                    'Utilisateur non trouvé',
                    HttpStatus.NOT_FOUND,
                );
            }

            if (!user.userIdFpay || user.isLink === false) {
                throw new HttpException(
                    'Ce compte Favor Help n\'est pas lié à un compte FPay',
                    HttpStatus.BAD_REQUEST,
                );
            }

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

    async makePayment(
        paymentDto: FpayPaymentDto,
        currentUser: UserEntity,
    ): Promise<FpayResponse<PaymentResponseDto>> {
        try {
            if (!currentUser) {
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }



            // ✅ Vérifier que le client a fourni un access_token
            if (!paymentDto.access_token) {
                throw new HttpException(
                    'access_token est requis pour le paiement FPay',
                    HttpStatus.BAD_REQUEST,
                );
            }


            // ✅ Utiliser FPAY_API_URL 
            const url = `${this.fpayApiUrl}/api/external/pay`;

            // ✅ NE PAS envoyer system_user_id
            const paymentData = {
                amount: paymentDto.amount,
                currency: paymentDto.currency || 'USD',
                description: paymentDto.description || `Paiement via FPay`,
                access_token: paymentDto.access_token,
            };

            // ✅ Utiliser l'API Key du service (pay)
            const headers = {
                'Authorization': this.apiKey,
                'Content-Type': 'application/json',
            };

            this.logger.log(`📤 Appel API Gateway: ${url}`);
            this.logger.log(`📤 Headers: Authorization: ${this.apiKey.substring(0, 20)}...`);
            this.logger.log(`📤 Payload:`, JSON.stringify(paymentData, null, 2));

            const response = await firstValueFrom(
                this.httpService.post<FpayResponse<PaymentResponseDto>>(
                    url,
                    paymentData,
                    { headers: headers }
                )
            );

            this.logger.log(`✅ Paiement réussi: ${response.data.data?.transaction?.reference || 'OK'}`);
            return response.data;

        } catch (error) {
            this.logger.error(`❌ Erreur de paiement: ${error.message}`);

            if (error.response) {
                this.logger.error(`📦 Réponse erreur: ${JSON.stringify(error.response.data)}`);
            }

            throw this.handleError(error);
        }
    }

    async payWithMobileMoney(
        amount: number,
        currency: string = 'CDF',
        description?: string,
        paymentMethod: string = 'MOBILE_MONEY',
        ipAddress?: string,
        lang: string = 'fr',
    ): Promise<any> {
        try {
            this.logger.log(`💰 Paiement Mobile Money: ${amount} ${currency}`);

            // ✅ Utiliser l'API Key HELP (celle qui a la permission 'pay')
            const url = `${this.fpayApiUrl}/api/external/pay/mobile_money`;

            const paymentData = {
                amount: amount,
                currency: currency || 'CDF',
                description: description || `Paiement Mobile Money`,
                paymentMethod: paymentMethod || 'MOBILE_MONEY',
            };

            // ✅ Utiliser l'API Key du service (pay)
            const headers = {
                'Authorization': this.apiKey,
                'Content-Type': 'application/json',
            };

            this.logger.log(`📤 Appel API Gateway: ${url}`);
            this.logger.log(`📤 Headers: Authorization: ${this.apiKey.substring(0, 30)}...`);
            this.logger.log(`📤 Payload:`, JSON.stringify(paymentData, null, 2));

            const response = await firstValueFrom(
                this.httpService.post<any>(
                    url,
                    paymentData,
                    { headers: headers }
                )
            );

            this.logger.log(`✅ Paiement Mobile Money réussi: ${response.data.data?.transaction?.reference || 'OK'}`);
            return response.data;

        } catch (error) {
            this.logger.error(`❌ Erreur paiement Mobile Money: ${error.message}`);

            if (error.response) {
                this.logger.error(`📦 Réponse erreur: ${JSON.stringify(error.response.data)}`);
            }

            throw this.handleError(error);
        }
    }

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

    async makeSendparrainage(
        sendDto: FpaySendDto,
        currentUser: UserEntity,
    ): Promise<{ success: boolean; message: string; data?: any }> {
        try {
            if (!currentUser) {
                return {
                    success: false,
                    message: 'Utilisateur non authentifié',
                };
            }

            // ✅ 1. API Key du PAYEUR (celui qui envoie l'argent)
            let payerApiKey = this.apiKey;  // ✅ FPAY_API_KEY_HELP
            if (!payerApiKey) {
                this.logger.error('❌ API Key HELP (payeur) non configurée');
                return {
                    success: false,
                    message: 'Configuration API Key HELP manquante',
                };
            }

            // ✅ 2. Récupérer l'API Key du DESTINATAIRE
            // Si sendDto.userId est fourni, l'utiliser, sinon utiliser la clé PARRAINAGE du .env
            let recipientApiKey = sendDto.userId || this.parrainageApiKey;

            if (!recipientApiKey) {
                this.logger.error('❌ Aucune API Key destinataire disponible');
                return {
                    success: false,
                    message: 'Aucune API Key destinataire disponible',
                };
            }

            // ✅ Nettoyer l'API Key du destinataire pour le body (enlever "Bearer " si présent)
            let cleanRecipientApiKey = recipientApiKey;
            if (cleanRecipientApiKey.startsWith('Bearer ')) {
                cleanRecipientApiKey = cleanRecipientApiKey.substring(7);
            }

            // ✅ Nettoyer l'API Key du payeur pour le log
            let cleanPayerApiKey = payerApiKey;
            if (cleanPayerApiKey.startsWith('Bearer ')) {
                cleanPayerApiKey = cleanPayerApiKey.substring(7);
            }

            // ✅ 3. Vérifier le paymentMethod
            const validPaymentMethods = ['MOBILE_MONEY', 'CASH', 'BANK_TRANSFER', 'CARD'];
            const paymentMethod = sendDto.paymentMethod || 'MOBILE_MONEY';

            if (!validPaymentMethods.includes(paymentMethod)) {
                return {
                    success: false,
                    message: `paymentMethod invalide. Valeurs acceptées: ${validPaymentMethods.join(', ')}`,
                };
            }

            // ✅ 4. Déterminer la devise
            const currency = sendDto.currency || 'USD';

            this.logger.log(`📤 ========== ENVOI PARRAINAGE ==========`);
            this.logger.log(`📤 === PAYEUR (FAVOR HELP) ===`);
            this.logger.log(`📤 API Key HELP: ${cleanPayerApiKey.substring(0, 50)}...`);
            this.logger.log(`📤 === DESTINATAIRE (PARRAIN) ===`);
            this.logger.log(`📤 API Key PARRAIN: ${cleanRecipientApiKey.substring(0, 50)}...`);
            this.logger.log(`📤 Source destinataire: ${sendDto.userId ? 'userId fourni' : 'clé .env'}`);
            this.logger.log(`📤 === INFORMATIONS TRANSFERT ===`);
            this.logger.log(`📤 Montant: ${sendDto.amount} ${currency}`);
            this.logger.log(`📤 PaymentMethod: ${paymentMethod}`);
            this.logger.log(`📤 Description: ${sendDto.description}`);
            this.logger.log(`📤 CountryCode: ${sendDto.countryCode || 'CD'}`);
            this.logger.log(`📤 =========================================`);

            // ✅ 5. Appel à l'API externe
            const url = `${this.fpayApiUrl}/api/external/send/parrainage`;

            // ✅ 6. Payload : on envoie l'API Key brute du destinataire (sans "Bearer ")
            const sendData = {
                toApiKey: cleanRecipientApiKey,  // ✅ API Key du parrain - sans "Bearer "
                amount: sendDto.amount,
                description: sendDto.description || `Envoi de parrainage`,
                currency: currency,
                countryCode: sendDto.countryCode || 'CD',
                paymentMethod: paymentMethod,
            };

            // ✅ 7. Headers : Authorization avec l'API Key du payeur (avec "Bearer ")
            const headers = {
                'Authorization': payerApiKey,  // ✅ Garder "Bearer " pour le header
                'Content-Type': 'application/json',
            };

            this.logger.log(`📤 Appel API PARRAINAGE: ${url}`);
            this.logger.log(`📤 Headers Authorization: ${cleanPayerApiKey.substring(0, 50)}...`);
            this.logger.log(`📤 Payload COMPLET:`, JSON.stringify(sendData, null, 2));

            const response = await firstValueFrom(
                this.httpService.post<FpayResponse<PaymentResponseDto>>(
                    url,
                    sendData,
                    { headers: headers }
                )
            );

            this.logger.log(`✅ Envoi PARRAINAGE réussi: ${response.data.data?.transaction?.reference || 'OK'}`);
            this.logger.log(`✅ Réponse complète:`, JSON.stringify(response.data, null, 2));

            return {
                success: true,
                message: 'Parrainage envoyé avec succès',
                data: response.data,
            };

        } catch (error) {
            this.logger.error(`❌ Erreur d'envoi PARRAINAGE: ${error.message}`);

            if (error.response) {
                this.logger.error(`📦 Réponse erreur: ${JSON.stringify(error.response.data)}`);
                this.logger.error(`📦 Status: ${error.response.status}`);
                this.logger.error(`📦 Headers: ${JSON.stringify(error.response.headers)}`);
            }

            if (error.request) {
                this.logger.error(`📦 Request: ${JSON.stringify(error.request)}`);
            }

            return {
                success: false,
                message: error.message || 'Erreur lors de l\'envoi du parrainage',
            };
        }
    }

    async makeSendFavorhelp(
        sendDto: FpaySendDto,
        currentUser: UserEntity,
    ): Promise<FpayResponse<PaymentResponseDto>> {
        try {
            if (!currentUser) {
                throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
            }

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
            const validPaymentMethods = ['MOBILE_MONEY', 'CASH', 'BANK_TRANSFER', 'CARD'];
            const paymentMethod = sendDto.paymentMethod || 'MOBILE_MONEY';

            if (!validPaymentMethods.includes(paymentMethod)) {
                throw new HttpException(
                    `paymentMethod invalide. Valeurs acceptées: ${validPaymentMethods.join(', ')}`,
                    HttpStatus.BAD_REQUEST,
                );
            }

            const url = `${this.fpayApiUrl}/api/external/send/parrainage`; // ✅ Nouvelle URL
            const sendData = {
                userId: sendDto.userId,
                amount: sendDto.amount,
                description: sendDto.description || `Envoi de parrainage vers ${recipientPhoneOrCode}`,
                currency: sendDto.currency || 'USD',
                countryCode: sendDto.countryCode || 'CD',
                paymentMethod: paymentMethod,
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

    async getWalletBalanceAndTransactions(
        userId: string,
        walletId?: string,
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

            const url = `${this.fpayApiUrl}/wallet/balance-transactions`;

            const params = new URLSearchParams();
            params.set('userId', userId);

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

    getFpayApiUrl(): string {
        return this.fpayApiUrl;
    }

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

    async getTransactionById(transactionId: string): Promise<any> {
        try {
            this.logger.log(`🔍 Récupération de la transaction: ${transactionId}`);

            if (!transactionId) {
                throw new HttpException(
                    'ID de transaction requis',
                    HttpStatus.BAD_REQUEST,
                );
            }

            const url = `${this.fpayApiUrl}/wallet/transactions/${transactionId}`;

            const response = await firstValueFrom(
                this.httpService.get(
                    url,
                    { headers: this.getHeaders() }
                )
            );

            this.logger.log(`✅ Transaction récupérée avec succès: ${transactionId}`);
            return response.data;

        } catch (error) {
            this.logger.error(`❌ Erreur récupération transaction: ${error.message}`);
            throw this.handleError(error);
        }
    }

    // src/modules/fpay/fpay.service.ts

    /**
     * Demande de dépôt avec vérification OTP
     * Étape 1: Envoie un OTP par SMS ou email
     * Étape 2: Vérifie l'OTP et effectue la demande de dépôt
     */
    async requestDepositWithOtp(
        dto: {
            userId: string;
            amount: number;
            currency: string;
            otpCode?: string;
        },
        lang: string = 'fr',
    ): Promise<any> {
        try {
            this.logger.log(`📤 Demande de dépôt avec OTP: ${dto.amount} ${dto.currency} pour ${dto.userId}`);

            // ✅ Validation initiale
            if (!dto.userId) {
                throw new HttpException(
                    'L\'ID de l\'utilisateur est requis',
                    HttpStatus.BAD_REQUEST,
                );
            }

            if (!dto.amount || dto.amount <= 0) {
                throw new HttpException(
                    'Le montant doit être supérieur à 0',
                    HttpStatus.BAD_REQUEST,
                );
            }

            if (!dto.currency) {
                throw new HttpException(
                    'La devise est obligatoire',
                    HttpStatus.BAD_REQUEST,
                );
            }

            // ============================================================
            // ÉTAPE 1: Vérifier si l'OTP est fourni
            // ============================================================
            const hasOtp = dto.otpCode && dto.otpCode.trim() !== '';

            if (!hasOtp) {
                this.logger.log(`📱 ÉTAPE 1 - Envoi OTP pour ${dto.userId}`);

                const generatedOtpCode = Math.floor(100000 + Math.random() * 900000).toString();
                const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

                // ✅ Récupérer l'utilisateur complet pour la relation
                const user = await this.userRepository.findOne({
                    where: { userIdFpay: dto.userId },
                    select: ['id', 'email', 'phone', 'fullName'],
                });

                if (!user) {
                    throw new HttpException(
                        'Utilisateur non trouvé. Veuillez vérifier vos identifiants.',
                        HttpStatus.NOT_FOUND,
                    );
                }

                // ✅ Utiliser l'email ou le téléphone
                let destination: string | null = null;
                let destinationType: 'email' | 'sms' = 'email';

                if (user.email) {
                    destination = user.email;
                    destinationType = 'email';
                } else if (user.phone) {
                    destination = user.phone;
                    destinationType = 'sms';
                }

                if (!destination) {
                    throw new HttpException(
                        'Aucun email ou téléphone trouvé pour cet utilisateur. Veuillez mettre à jour votre profil.',
                        HttpStatus.BAD_REQUEST,
                    );
                }

                this.logger.log(`📤 Destination: ${destination} (${destinationType})`);

                // ✅ Marquer les anciens OTPs comme utilisés
                await this.otpRepository.update(
                    { email: destination, isUsed: false },
                    { isUsed: true }
                );

                // ✅ Créer l'OTP avec la relation user
                const otp = this.otpRepository.create({
                    email: destination,
                    otpCode: generatedOtpCode,
                    expiresAt: otpExpiry,
                    isUsed: false,
                    user: user,  // ✅ Assigner l'utilisateur complet
                });
                await this.otpRepository.save(otp);

                this.logger.log(`✅ OTP sauvegardé: ${generatedOtpCode} pour ${destination}`);

                // ✅ Envoyer l'OTP
                if (destinationType === 'email') {
                    const translations = {
                        title: 'Code de vérification pour votre dépôt',
                        description: 'Utilisez le code ci-dessous pour confirmer votre demande de dépôt sur FPay',
                        label: 'VOTRE CODE DE VÉRIFICATION',
                        expiry: 'Ce code expire dans 10 minutes',
                        footerCopyright: `© ${new Date().getFullYear()} FavorHelp. Tous droits réservés.`,
                        footerSecurity: 'Protection des données | Email sécurisé',
                        legalNote: 'Favor Help — Écosystème digital par Favor Group | RCCM: 21-A-770 | N° IMPÔT: A2156062L | National ID: 19-G4701-N74976H',
                    };

                    await this.mailService.sendHtmlEmail(
                        destination,
                        'Code OTP pour votre dépôt FPay',
                        'sendOtp.html',
                        {
                            otpCode: generatedOtpCode,
                            year: new Date().getFullYear(),
                            lang: lang,
                            translations: translations,
                        },
                    );
                    this.logger.log(`✅ OTP envoyé par email à ${destination}`);
                } else {
                    const smsMessage = `Votre code OTP pour le dépôt FPay est: ${generatedOtpCode}. Valable 10 minutes.`;
                    await this.smsHelper.sendSms(destination, smsMessage);
                    this.logger.log(`✅ OTP envoyé par SMS à ${destination}`);
                }

                return {
                    status: 'success',
                    message: `Un code OTP a été envoyé par ${destinationType === 'email' ? 'email' : 'SMS'}. Veuillez le saisir pour confirmer votre demande de dépôt.`,
                    requiresOtp: true,
                    data: {
                        userId: dto.userId,
                        amount: dto.amount,
                        currency: dto.currency,
                        destination: destinationType,
                    },
                };
            }

            // ============================================================
            // ÉTAPE 2: Vérifier l'OTP
            // ============================================================
            this.logger.log(`🔐 ÉTAPE 2 - Vérification OTP: ${dto.otpCode} pour ${dto.userId}`);

            // ✅ Récupérer l'utilisateur
            const user = await this.userRepository.findOne({
                where: { userIdFpay: dto.userId },
                select: ['id', 'email', 'phone'],
            });

            if (!user) {
                throw new HttpException(
                    'Utilisateur non trouvé. Veuillez vérifier vos identifiants.',
                    HttpStatus.NOT_FOUND,
                );
            }

            // ✅ Utiliser la même destination que l'ÉTAPE 1
            let destination: string | null = null;

            if (user.email) {
                destination = user.email;
            } else if (user.phone) {
                destination = user.phone;
            }

            if (!destination) {
                throw new HttpException(
                    'Aucun email ou téléphone trouvé pour cet utilisateur. Veuillez mettre à jour votre profil.',
                    HttpStatus.BAD_REQUEST,
                );
            }

            this.logger.log(`🔍 Recherche OTP avec destination: ${destination}`);
            this.logger.log(`🔍 Code OTP: ${dto.otpCode}`);

            // ✅ Vérifier l'OTP
            const otpCode = dto.otpCode as string;

            const otpEntry = await this.otpRepository.findOne({
                where: {
                    email: destination,
                    otpCode: otpCode.trim(),
                    isUsed: false,
                },
                relations: ['user'],  // ✅ Charger la relation user
            });

            if (!otpEntry) {
                // ✅ Vérifier si l'OTP existe mais est utilisé
                const existingOtp = await this.otpRepository.findOne({
                    where: {
                        email: destination,
                        otpCode: otpCode.trim(),
                    },
                });

                if (existingOtp) {
                    this.logger.log(`⚠️ OTP trouvé mais isUsed=${existingOtp.isUsed}`);
                    if (existingOtp.isUsed) {
                        throw new HttpException(
                            'Ce code OTP a déjà été utilisé.',
                            HttpStatus.BAD_REQUEST,
                        );
                    }
                    if (new Date() > existingOtp.expiresAt) {
                        throw new HttpException(
                            'Code OTP expiré. Veuillez refaire une demande.',
                            HttpStatus.BAD_REQUEST,
                        );
                    }
                }

                throw new HttpException(
                    'Code OTP invalide. Veuillez vérifier le code saisi.',
                    HttpStatus.BAD_REQUEST,
                );
            }

            // ✅ Vérifier l'expiration
            if (new Date() > otpEntry.expiresAt) {
                otpEntry.isUsed = true;
                await this.otpRepository.save(otpEntry);

                throw new HttpException(
                    'Code OTP expiré. Veuillez refaire une demande pour recevoir un nouveau code.',
                    HttpStatus.BAD_REQUEST,
                );
            }

            // ✅ Marquer l'OTP comme utilisé
            otpEntry.isUsed = true;
            await this.otpRepository.save(otpEntry);

            this.logger.log(`✅ OTP vérifié avec succès`);

            // ============================================================
            // ÉTAPE 3: Effectuer la demande de dépôt
            // ============================================================
            const url = `${this.fpayApiUrl}/wallet/deposit/request`;

            this.logger.log(`📤 Appel API FPay: ${url}`);
            this.logger.log(`📤 Payload: ${JSON.stringify({
                userId: dto.userId,
                amount: dto.amount,
                currency: dto.currency,
            })}`);

            const response = await firstValueFrom(
                this.httpService.post(
                    url,
                    {
                        userId: dto.userId,
                        amount: dto.amount,
                        currency: dto.currency,
                    },
                    { headers: this.getHeaders() }
                )
            );

            this.logger.log(`✅ Demande de dépôt enregistrée: ${response.data.data?.transaction?.reference || 'OK'}`);

            return {
                status: 'success',
                message: `Demande de dépôt de ${dto.amount} ${dto.currency} enregistrée avec succès. Référence: ${response.data.data?.transaction?.reference || 'N/A'}`,
                data: response.data.data,
                requiresOtp: false,
            };

        } catch (error) {
            this.logger.error(`❌ Erreur demande de dépôt: ${error.message}`);

            if (error.response) {
                this.logger.error(`📦 Réponse erreur: ${JSON.stringify(error.response.data)}`);
            }

            throw this.handleError(error);
        }
    }

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