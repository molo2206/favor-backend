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
import { ReferralEntity } from 'src/users/entities/referral.entity';

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

        @InjectRepository(ReferralEntity)  // ✅ Ajouter
        private readonly referralRepository: Repository<ReferralEntity>,
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
            if (!userId || userId.trim() === '') {
                throw new Error('userId est requis');
            }

            this.logger.log(`📊 Récupération balance/transactions: userIdFpay=${userId}`);

            const url = `${this.fpayApiUrl}/wallet/balance-transactions`;

            const params = new URLSearchParams();
            params.set('userId', userId.trim());
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
                this.httpService.get(fullUrl, { headers: this.getHeaders() })
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

    async getLastPendingTransaction(
        userId: string,
        type?: 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER' | 'PAYMENT' | 'REFUND',
    ): Promise<any> {
        try {
            this.logger.log(`🔍 Recherche des transactions PENDING pour ${userId}${type ? ` (type: ${type})` : ''}`);

            const result = await this.getWalletBalanceAndTransactions(
                userId,
                1,
                100,
                undefined,
                undefined,
                type,
                undefined,
                undefined,
                undefined,
            );

            let transactions: any[] = [];

            if (result?.data?.transactions && Array.isArray(result.data.transactions)) {
                transactions = result.data.transactions;
            } else if (result?.data?.transactions?.data && Array.isArray(result.data.transactions.data)) {
                transactions = result.data.transactions.data;
            } else if (result?.data && Array.isArray(result.data)) {
                transactions = result.data;
            } else if (Array.isArray(result)) {
                transactions = result;
            }

            if (!transactions || transactions.length === 0) {
                this.logger.log(`ℹ️ Aucune transaction trouvée pour ${userId}`);
                return {
                    success: true,
                    message: 'Aucune transaction trouvée',
                    data: {},
                    totalsByCurrency: {},
                    currencies: [],
                    count: 0,
                };
            }

            // ✅ Filtrer par status PENDING
            const pendingTransactions = transactions.filter(
                (tx: any) => tx.status === 'PENDING' || tx.status === 'pending'
            );

            this.logger.log(`⏳ ${pendingTransactions.length} transaction(s) en PENDING`);

            // ✅ Récupérer toutes les devises disponibles (même sans transactions PENDING)
            const allCurrencies: string[] = [];

            // Récupérer les devises depuis les wallets
            if (result?.data?.wallets && Array.isArray(result.data.wallets)) {
                result.data.wallets.forEach((wallet: any) => {
                    if (wallet.currency && !allCurrencies.includes(wallet.currency)) {
                        allCurrencies.push(wallet.currency);
                    }
                });
            }

            // Ajouter les devises des transactions (si pas déjà dans les wallets)
            transactions.forEach((tx: any) => {
                const currency = tx.currency || 'USD';
                if (!allCurrencies.includes(currency)) {
                    allCurrencies.push(currency);
                }
            });

            this.logger.log(`💰 Devises disponibles: ${allCurrencies.join(', ')}`);

            // ✅ Grouper par devise (même vides)
            const allByCurrency: { [currency: string]: any[] } = {};
            const totalsByCurrency: { [currency: string]: number } = {};

            // ✅ Initialiser toutes les devises avec un tableau vide
            allCurrencies.forEach((currency) => {
                allByCurrency[currency] = [];
                totalsByCurrency[currency] = 0;
            });

            // ✅ Remplir les transactions PENDING par devise
            pendingTransactions.forEach((tx: any) => {
                const currency = tx.currency || 'USD';

                if (!allByCurrency[currency]) {
                    allByCurrency[currency] = [];
                }
                allByCurrency[currency].push(tx);

                if (!totalsByCurrency[currency]) {
                    totalsByCurrency[currency] = 0;
                }
                totalsByCurrency[currency] += (tx.amount || 0);
            });

            // ✅ Formater toutes les transactions par devise
            const formattedData: { [currency: string]: any[] } = {};

            allCurrencies.forEach((currency) => {
                const txs = allByCurrency[currency] || [];
                formattedData[currency] = txs.map((tx: any) => ({
                    id: tx.id || tx.transactionId,
                    amount: tx.amount,
                    currency: tx.currency,
                    type: tx.type,
                    status: tx.status,
                    createdAt: tx.createdAt || tx.created_at,
                    description: tx.description,
                    reference: tx.reference,
                    walletId: tx.walletId,
                    userId: tx.userId,
                    movement: tx.movement,
                    paymentMethod: tx.paymentMethod,
                    external_reference: tx.external_reference,
                    metadata: tx.metadata || null,
                    ...tx,
                }));
            });

            const totalCount = pendingTransactions.length;
            const currenciesWithData = Object.keys(allByCurrency).filter(
                (currency) => allByCurrency[currency].length > 0
            );

            this.logger.log(`✅ Devises avec transactions: ${currenciesWithData.join(', ')}`);
            this.logger.log(`📊 Totaux par devise: ${JSON.stringify(totalsByCurrency)}`);

            return {
                success: true,
                message: `${totalCount} transaction(s) en attente sur ${allCurrencies.length} devise(s)`,
                data: formattedData,
                totalsByCurrency: totalsByCurrency,
                currencies: allCurrencies,
                currenciesWithData: currenciesWithData,
                count: totalCount,
            };

        } catch (error) {
            this.logger.error(`❌ Erreur: ${error.message}`);
            return {
                success: false,
                message: error.message || 'Erreur lors de la récupération',
                data: {},
                totalsByCurrency: {},
                currencies: [],
                currenciesWithData: [],
                count: 0,
            };
        }
    }

    async requestDepositWithOtp(
        dto: {
            userId: string;           // BÉNÉFICIAIRE (celui qui reçoit)
            amount: number;
            currency: string;
            otpCode?: string;
        },
        apiKey?: string,              // ✅ API Key du payeur (FPay gère tout)
        lang: string = 'fr',
    ): Promise<any> {
        try {
            this.logger.log(`📤 Demande de dépôt avec OTP: ${dto.amount} ${dto.currency} pour ${dto.userId}`);

            // ============================================================
            // VALIDATIONS INITIALES
            // ============================================================
            if (!dto.userId) {
                throw new HttpException(
                    'L\'ID de l\'utilisateur (bénéficiaire) est requis',
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

            // ✅ Vérifier que l'API Key est fournie (FPay gère la validation)
            if (!apiKey) {
                throw new HttpException(
                    'API Key requise pour identifier le payeur',
                    HttpStatus.UNAUTHORIZED,
                );
            }

            // ============================================================
            // ✅ VÉRIFICATION DES TRANSACTIONS EN ATTENTE
            // ============================================================
            try {
                this.logger.log(`🔍 Vérification des transactions en attente pour ${dto.userId}`);

                const transactionsData = await this.getWalletBalanceAndTransactions(
                    dto.userId,
                    1,
                    10,
                    undefined,
                    undefined,
                    'DEPOSIT',
                    'PENDING',
                    undefined,
                    undefined,
                );

                let allPending: any[] = [];

                if (transactionsData?.data?.transactions && Array.isArray(transactionsData.data.transactions)) {
                    allPending = transactionsData.data.transactions.filter(
                        (tx: any) => tx.status === 'PENDING' || tx.status === 'pending'
                    );
                } else if (transactionsData?.data && Array.isArray(transactionsData.data)) {
                    allPending = transactionsData.data.filter(
                        (tx: any) => tx.status === 'PENDING' || tx.status === 'pending'
                    );
                } else if (transactionsData?.data?.transactions?.data && Array.isArray(transactionsData.data.transactions.data)) {
                    allPending = transactionsData.data.transactions.data.filter(
                        (tx: any) => tx.status === 'PENDING' || tx.status === 'pending'
                    );
                } else if (Array.isArray(transactionsData)) {
                    allPending = transactionsData.filter(
                        (tx: any) => tx.status === 'PENDING' || tx.status === 'pending'
                    );
                }

                if (allPending.length > 0) {
                    const pendingTx = allPending[0];
                    throw new HttpException(
                        {
                            statusCode: HttpStatus.BAD_REQUEST,
                            message: `Vous avez déjà une demande de dépôt en cours de ${pendingTx.amount} ${pendingTx.currency}. Veuillez attendre sa finalisation.`,
                            code: 'PENDING_TRANSACTION_EXISTS',
                            pendingTransaction: {
                                id: pendingTx.id,
                                amount: pendingTx.amount,
                                currency: pendingTx.currency,
                                status: pendingTx.status,
                                createdAt: pendingTx.createdAt,
                            },
                        },
                        HttpStatus.BAD_REQUEST,
                    );
                }

                this.logger.log(`✅ Aucune transaction en attente trouvée`);

            } catch (error: any) {
                if (error instanceof HttpException) {
                    throw error;
                }
                this.logger.warn(`⚠️ Erreur lors de la vérification des transactions: ${error.message}`);
            }

            // ============================================================
            // ÉTAPE 1: Vérifier si l'OTP est fourni
            // ============================================================
            const hasOtp = dto.otpCode && dto.otpCode.trim() !== '';

            if (!hasOtp) {
                this.logger.log(`📱 ÉTAPE 1 - Envoi OTP pour ${dto.userId}`);
                const generatedOtpCode = Math.floor(1000 + Math.random() * 9000).toString();
                const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

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
                        'Aucun email ou téléphone trouvé pour cet utilisateur.',
                        HttpStatus.BAD_REQUEST,
                    );
                }

                this.logger.log(`📤 Destination: ${destination} (${destinationType})`);

                await this.otpRepository.update(
                    { email: destination, isUsed: false },
                    { isUsed: true }
                );

                const otp = this.otpRepository.create({
                    email: destination,
                    otpCode: generatedOtpCode,
                    expiresAt: otpExpiry,
                    isUsed: false,
                    user: user,
                });
                await this.otpRepository.save(otp);

                this.logger.log(`✅ OTP sauvegardé: ${generatedOtpCode} pour ${destination}`);

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
                    message: `Un code OTP a été envoyé par ${destinationType === 'email' ? 'email' : 'SMS'}.`,
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

            const user = await this.userRepository.findOne({
                where: { userIdFpay: dto.userId },
                select: ['id', 'email', 'phone'],
            });

            if (!user) {
                throw new HttpException(
                    'Utilisateur non trouvé.',
                    HttpStatus.NOT_FOUND,
                );
            }

            let destination: string | null = null;
            if (user.email) {
                destination = user.email;
            } else if (user.phone) {
                destination = user.phone;
            }

            if (!destination) {
                throw new HttpException(
                    'Aucun email ou téléphone trouvé pour cet utilisateur.',
                    HttpStatus.BAD_REQUEST,
                );
            }

            this.logger.log(`🔍 Recherche OTP avec destination: ${destination}`);
            this.logger.log(`🔍 Code OTP: ${dto.otpCode}`);

            const otpCode = dto.otpCode as string;

            const otpEntry = await this.otpRepository.findOne({
                where: {
                    email: destination,
                    otpCode: otpCode.trim(),
                    isUsed: false,
                },
                relations: ['user'],
            });

            if (!otpEntry) {
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
                            {
                                statusCode: HttpStatus.BAD_REQUEST,
                                message: 'Ce code OTP a déjà été utilisé.',
                                code: 'OTP_ALREADY_USED',
                                canResend: true,
                            },
                            HttpStatus.BAD_REQUEST,
                        );
                    }
                    if (new Date() > existingOtp.expiresAt) {
                        throw new HttpException(
                            {
                                statusCode: HttpStatus.BAD_REQUEST,
                                message: 'Ce code OTP a expiré.',
                                code: 'OTP_EXPIRED',
                                canResend: true,
                            },
                            HttpStatus.BAD_REQUEST,
                        );
                    }
                }

                throw new HttpException(
                    {
                        statusCode: HttpStatus.BAD_REQUEST,
                        message: 'Code OTP invalide.',
                        code: 'INVALID_OTP',
                        canResend: true,
                    },
                    HttpStatus.BAD_REQUEST,
                );
            }

            if (new Date() > otpEntry.expiresAt) {
                otpEntry.isUsed = true;
                await this.otpRepository.save(otpEntry);
                throw new HttpException(
                    {
                        status: 'error',
                        message: 'Code OTP expiré.',
                        code: 'OTP_EXPIRED',
                        canResend: true,
                    },
                    HttpStatus.BAD_REQUEST,
                );
            }

            otpEntry.isUsed = true;
            await this.otpRepository.save(otpEntry);

            this.logger.log(`✅ OTP vérifié avec succès`);

            // ============================================================
            // ÉTAPE 3: Effectuer la demande de dépôt (FPay gère tout)
            // ============================================================
            const url = `${this.fpayApiUrl}/wallet/deposit/request`;

            const payload: any = {
                userId: dto.userId,
                amount: dto.amount,
                currency: dto.currency,
                apiKey: apiKey,           // ✅ API Key du payeur dans le body
            };

            this.logger.log(`📤 Appel API FPay: ${url}`);
            this.logger.log(`📤 Payload: ${JSON.stringify(payload)}`);

            const response = await firstValueFrom(
                this.httpService.post(
                    url,
                    payload,
                    { headers: this.getHeaders() }
                )
            );

            this.logger.log(`✅ Demande de dépôt enregistrée: ${response.data.data?.transaction?.reference || 'OK'}`);

            // ============================================================
            // ✅ ÉTAPE 4: DIMINUER LES POINTS DE PARRAINAGE
            // ============================================================
            try {
                this.logger.log(`🔄 Diminution des points de parrainage pour ${dto.userId}: ${dto.amount} ${dto.currency}`);

                const userWithReferrals = await this.userRepository.findOne({
                    where: { userIdFpay: dto.userId },
                    relations: ['referralHistory'],
                });

                if (!userWithReferrals) {
                    this.logger.warn(`⚠️ Utilisateur non trouvé pour la diminution des points`);
                } else {
                    let totalPointsInCurrency = 0;
                    const referralsToUpdate: { id: string; amount: number; currency: string }[] = [];

                    for (const referral of userWithReferrals.referralHistory || []) {
                        const referralCurrency = referral.currency || 'USD';
                        const referralAmount = Number(referral.rewardAmount) || 0;

                        if (referralCurrency === dto.currency && referralAmount > 0) {
                            totalPointsInCurrency += referralAmount;
                            referralsToUpdate.push({
                                id: referral.id,
                                amount: referralAmount,
                                currency: referralCurrency,
                            });
                        }
                    }

                    if (totalPointsInCurrency < dto.amount) {
                        this.logger.warn(`⚠️ Points insuffisants en ${dto.currency}. Disponible: ${totalPointsInCurrency}, Demandé: ${dto.amount}`);
                    } else {
                        let remainingAmount = dto.amount;
                        const sortedReferrals = referralsToUpdate.sort((a, b) => {
                            const refA = userWithReferrals.referralHistory?.find(r => r.id === a.id);
                            const refB = userWithReferrals.referralHistory?.find(r => r.id === b.id);
                            return (refB?.createdAt?.getTime() || 0) - (refA?.createdAt?.getTime() || 0);
                        });

                        for (const referralInfo of sortedReferrals) {
                            if (remainingAmount <= 0) break;

                            const referral = userWithReferrals.referralHistory?.find(r => r.id === referralInfo.id);
                            if (!referral) continue;

                            const currentAmount = Number(referral.rewardAmount) || 0;

                            if (currentAmount <= remainingAmount) {
                                referral.rewardAmount = 0;
                                remainingAmount -= currentAmount;
                                this.logger.log(`✅ Parrainage ${referral.id}: ${currentAmount} ${referralInfo.currency} entièrement déduit`);
                            } else {
                                referral.rewardAmount = currentAmount - remainingAmount;
                                this.logger.log(`✅ Parrainage ${referral.id}: ${currentAmount} → ${referral.rewardAmount} ${referralInfo.currency} (partiel)`);
                                remainingAmount = 0;
                            }

                            await this.referralRepository.save(referral);
                        }

                        const totalAllCurrencies = userWithReferrals.referralHistory?.reduce((sum, r) => {
                            return sum + (Number(r.rewardAmount) || 0);
                        }, 0) || 0;

                        userWithReferrals.referralPoints = totalAllCurrencies;
                        await this.userRepository.save(userWithReferrals);

                        this.logger.log(`✅ Points diminués: ${dto.amount} ${dto.currency}.`);
                    }
                }
            } catch (referralError) {
                this.logger.error(`❌ Erreur lors de la diminution des points: ${referralError.message}`);
            }

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

    async decreaseReferralPoints(
        userId: string,
        amount: number,
        currency: string,
        lang: string = 'fr',
    ): Promise<{ success: boolean; message: string; remainingPoints: number; currency: string }> {
        try {
            this.logger.log(`📉 Diminution des points de parrainage: ${amount} ${currency} pour l'utilisateur ${userId}`);

            // ✅ Vérifier que l'utilisateur existe
            const user = await this.userRepository.findOne({
                where: { id: userId },
                relations: ['referralHistory'],
            });

            if (!user) {
                throw new HttpException(
                    'Utilisateur non trouvé',
                    HttpStatus.NOT_FOUND,
                );
            }

            // ✅ Calculer le total des points dans cette devise
            let totalPointsInCurrency = 0;
            const referralsToUpdate: { id: string; amount: number; currency: string }[] = [];

            // ✅ Parcourir l'historique des parrainages pour trouver les points dans la devise
            for (const referral of user.referralHistory || []) {
                const referralCurrency = referral.currency || 'USD';
                const referralAmount = Number(referral.rewardAmount) || 0;

                if (referralCurrency === currency && referralAmount > 0) {
                    totalPointsInCurrency += referralAmount;
                    referralsToUpdate.push({
                        id: referral.id,
                        amount: referralAmount,
                        currency: referralCurrency,
                    });
                }
            }

            // ✅ Vérifier si l'utilisateur a assez de points
            if (totalPointsInCurrency < amount) {
                throw new HttpException(
                    `Points insuffisants en ${currency}. Disponible: ${totalPointsInCurrency.toFixed(2)} ${currency}, Demandé: ${amount} ${currency}`,
                    HttpStatus.BAD_REQUEST,
                );
            }

            // ✅ Diminuer les points en commençant par les plus récents
            let remainingAmount = amount;
            const updatedReferrals: any[] = [];

            // Trier par date de création (du plus récent au plus ancien)
            const sortedReferrals = referralsToUpdate.sort((a, b) => {
                const refA = user.referralHistory?.find(r => r.id === a.id);
                const refB = user.referralHistory?.find(r => r.id === b.id);
                return (refB?.createdAt?.getTime() || 0) - (refA?.createdAt?.getTime() || 0);
            });

            for (const referralInfo of sortedReferrals) {
                if (remainingAmount <= 0) break;

                const referral = user.referralHistory?.find(r => r.id === referralInfo.id);
                if (!referral) continue;

                const currentAmount = Number(referral.rewardAmount) || 0;

                if (currentAmount <= remainingAmount) {
                    // ✅ Supprimer entièrement ce parrainage
                    referral.rewardAmount = 0;
                    remainingAmount -= currentAmount;
                } else {
                    // ✅ Diminuer partiellement
                    referral.rewardAmount = currentAmount - remainingAmount;
                    remainingAmount = 0;
                }

                updatedReferrals.push({
                    id: referral.id,
                    oldAmount: currentAmount,
                    newAmount: referral.rewardAmount,
                    currency: referral.currency,
                });

                await this.referralRepository.save(referral);
            }

            // ✅ Recalculer le total des points restants
            let remainingTotal = 0;
            for (const referral of user.referralHistory || []) {
                if (referral.currency === currency) {
                    remainingTotal += Number(referral.rewardAmount) || 0;
                }
            }

            // ✅ Mettre à jour les points de l'utilisateur
            const totalAllCurrencies = user.referralHistory?.reduce((sum, r) => {
                return sum + (Number(r.rewardAmount) || 0);
            }, 0) || 0;

            user.referralPoints = totalAllCurrencies;
            await this.userRepository.save(user);

            this.logger.log(`✅ Points diminués: ${amount} ${currency}. Restant: ${remainingTotal.toFixed(2)} ${currency}`);

            return {
                success: true,
                message: `${amount} ${currency} points de parrainage ont été déduits avec succès.`,
                remainingPoints: remainingTotal,
                currency: currency,
            };

        } catch (error) {
            this.logger.error(`❌ Erreur lors de la diminution des points: ${error.message}`);
            throw this.handleError(error);
        }
    }

    // src/modules/fpay/fpay.service.ts

    private handleError(error: any): HttpException {
        // ✅ Si l'erreur est déjà une HttpException, on la retourne
        if (error instanceof HttpException) {
            return error;
        }

        // ✅ Si c'est une erreur avec un message personnalisé (comme OTP)
        if (error.message) {
            // ✅ Vérifier si l'erreur contient des codes OTP
            if (error.code === 'INVALID_OTP' || error.message.includes('OTP')) {
                return new HttpException(
                    {
                        statusCode: HttpStatus.BAD_REQUEST,
                        message: error.message,
                        code: error.code || 'INVALID_OTP',
                        canResend: true,
                        timestamp: new Date().toISOString(),
                    },
                    HttpStatus.BAD_REQUEST,
                );
            }

            // ✅ Si c'est une erreur avec un message simple
            return new HttpException(
                {
                    statusCode: HttpStatus.BAD_REQUEST,
                    message: error.message,
                    timestamp: new Date().toISOString(),
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        // ✅ Erreur avec réponse HTTP
        if (error.response) {
            const status = error.response.status || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = error.response.data?.message || error.response.message || 'FPAY API error';

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

        // ✅ Service indisponible
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

        // ✅ Erreur interne par défaut
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