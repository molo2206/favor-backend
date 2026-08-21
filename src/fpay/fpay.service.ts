// src/modules/fpay/fpay.service.ts
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { FpayPaymentDto } from './dto/payment.dto';
import {
    FpayResponse,
    AuthSuccessResponse,
    PaymentResponseDto
} from './dto/response.dto';
import { AuthLoginDto } from './dto/link-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { FpaySendDto } from './dto/send.dto';

@Injectable()
export class FpayService {
    private readonly logger = new Logger(FpayService.name);
    private readonly fpayApiUrl: string;
    private readonly apiKey: string;
    private readonly logisticApiKey: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,
    ) {
        const fpayApiUrl = this.configService.get<string>('FPAY_API_URL');
        const apiKey = this.configService.get<string>('FPAY_API_KEY_HELP');
        const logisticApiKey = this.configService.get<string>('FPAY_API_KEY_LOGISTIC');

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
            const url = `${this.fpayApiUrl}/auth/link-user`;
            const hasOtp = authDto.otpCode && authDto.otpCode.trim() !== '';

            this.logger.log(`Authenticating user: ${authDto.phone}, hasOtp: ${hasOtp}`);

            if (!hasOtp) {
                this.logger.log(`📱 Demande d'envoi OTP à ${authDto.phone}`);

                const otpResponse = await firstValueFrom(
                    this.httpService.post<any>(
                        url,
                        {
                            phone: authDto.phone,
                            password: authDto.password,
                        },
                        { headers: this.getHeaders() }
                    )
                );

                this.logger.log(`✅ OTP envoyé à ${authDto.phone}`);

                return {
                    success: true,
                    requiresOtp: true,
                    message: otpResponse.data.message || 'Code OTP envoyé avec succès',
                    data: null
                };
            }

            this.logger.log(`🔐 Tentative de connexion avec OTP pour ${authDto.phone}`);

            const response = await firstValueFrom(
                this.httpService.post<any>(
                    url,
                    authDto,
                    { headers: this.getHeaders() }
                )
            );

            this.logger.log(`✅ User authenticated successfully`);

            if (systemUserId && response.data?.data?.id) {
                await this.saveFpayUserId(systemUserId, response.data.data.id);
            }

            return {
                success: true,
                message: response.data.message || 'Connexion réussie',
                data: response.data.data,
                requiresOtp: false,
                isLinked: true,
            };
        } catch (error) {
            this.logger.error(`Error authenticating user: ${error.message}`);

            return {
                success: false,
                message: error.response?.data?.message || error.message || 'Erreur lors de l\'authentification',
                error: error.response?.data || null
            };
        }
    }

    private async saveFpayUserId(systemUserId: string, fpayUserId: string): Promise<void> {
        try {
            await this.userRepository.update(
                { id: systemUserId },
                {
                    userIdFpay: fpayUserId,
                    isLink: true  
                }
            );
            this.logger.log(`✅ userIdFpay ${fpayUserId} saved for user ${systemUserId}`);
        } catch (error) {
            this.logger.error(`❌ Error saving userIdFpay: ${error.message}`);
        }
    }

    async makePayment(
        paymentDto: FpayPaymentDto,
        currentUser: UserEntity,
    ): Promise<FpayResponse<PaymentResponseDto>> {
        try {
            if (!currentUser) {
                throw new HttpException(
                    'User not authenticated',
                    HttpStatus.UNAUTHORIZED,
                );
            }

            let user = currentUser;

            if (!user.userIdFpay) {
                this.logger.warn(`⚠️ userIdFpay manquant pour ${user.id}, tentative de rechargement depuis la base...`);

                const fullUser = await this.userRepository.findOne({
                    where: { id: user.id },
                });

                if (fullUser?.userIdFpay) {
                    user = fullUser;
                    this.logger.log(`✅ userIdFpay récupéré: ${user.userIdFpay}`);
                } else {
                    this.logger.error(`❌ Payeur ${user.id} n'a pas de compte FPAY lié`);

                    throw new HttpException(
                        'Vous devez d\'abord lier votre compte FPAY. Utilisez /fpay/auth/link-user avec un OTP.',
                        HttpStatus.BAD_REQUEST,
                    );
                }
            }

            let cleanApiKey = this.apiKey;
            if (cleanApiKey.startsWith('Bearer ')) {
                cleanApiKey = cleanApiKey.substring(7);
                this.logger.log(`🔑 API Key nettoyée (sans Bearer): ${cleanApiKey.substring(0, 50)}...`);
            }

            this.logger.log(`🔑 ===== CONTENU DE L'API KEY =====`);
            this.logger.log(`🔑 API Key (originale): ${this.apiKey.substring(0, 100)}...`);
            this.logger.log(`🔑 API Key (nettoyée): ${cleanApiKey.substring(0, 100)}...`);

            let recipientPhoneOrCode: string | null = null;
            let decodedPayload: any = null;

            try {
                const apiKeyParts = cleanApiKey.split('.');
                this.logger.log(`🔑 Nombre de parties: ${apiKeyParts.length}`);

                if (apiKeyParts.length === 3) {
                    const headerJson = Buffer.from(apiKeyParts[0], 'base64').toString('utf-8');
                    const header = JSON.parse(headerJson);
                    this.logger.log(`🔑 Header: ${JSON.stringify(header, null, 2)}`);

                    const payloadJson = Buffer.from(apiKeyParts[1], 'base64').toString('utf-8');
                    const payload = JSON.parse(payloadJson);
                    decodedPayload = payload;

                    this.logger.log(`🔑 ===== PAYLOAD DÉCODÉ =====`);
                    this.logger.log(`🔑 Payload complet: ${JSON.stringify(payload, null, 2)}`);

                    this.logger.log(`🔑 sub: ${payload.sub}`);
                    this.logger.log(`🔑 userId: ${payload.userId}`);
                    this.logger.log(`🔑 fullName: ${payload.fullName}`);
                    this.logger.log(`🔑 email: ${payload.email}`);
                    this.logger.log(`🔑 phone: ${payload.phone}`);
                    this.logger.log(`🔑 role: ${payload.role}`);
                    this.logger.log(`🔑 status: ${payload.status}`);
                    this.logger.log(`🔑 merchantCode: ${payload.merchantCode}`);
                    this.logger.log(`🔑 merchantType: ${payload.merchantType}`);
                    this.logger.log(`🔑 businessName: ${payload.businessName}`);
                    this.logger.log(`🔑 kycStatus: ${payload.kycStatus}`);
                    this.logger.log(`🔑 countryCode: ${payload.countryCode}`);
                    this.logger.log(`🔑 permissions: ${JSON.stringify(payload.permissions)}`);
                    this.logger.log(`🔑 iat: ${new Date(payload.iat * 1000).toISOString()}`);
                    this.logger.log(`🔑 exp: ${new Date(payload.exp * 1000).toISOString()}`);
                    this.logger.log(`🔑 jti: ${payload.jti}`);

                    recipientPhoneOrCode = payload.phone || payload.merchantCode || payload.sub;

                    this.logger.log(`🔑 ===== DESTINATAIRE EXTRAIT =====`);
                    this.logger.log(`🔑 Recipient phoneOrCode: ${recipientPhoneOrCode}`);
                } else {
                    this.logger.warn(`⚠️ Format d'API Key invalide: ${cleanApiKey.substring(0, 30)}...`);
                    this.logger.warn(`⚠️ Nombre de parties: ${apiKeyParts.length}, attendu: 3`);
                }
            } catch (error) {
                this.logger.error(`❌ Erreur lors du décodage de l'API Key: ${error.message}`);
                this.logger.error(`❌ API Key (nettoyée): ${cleanApiKey.substring(0, 50)}...`);
            }

            if (!recipientPhoneOrCode) {
                throw new HttpException(
                    'Impossible d\'extraire le destinataire de l\'API Key',
                    HttpStatus.BAD_REQUEST,
                );
            }

            this.logger.log(`👤 ===== INFORMATIONS DU PAYEUR =====`);
            this.logger.log(`👤 ID: ${user.id}`);
            this.logger.log(`👤 FullName: ${user.fullName}`);
            this.logger.log(`👤 Phone: ${user.phone}`);
            this.logger.log(`👤 Email: ${user.email}`);
            this.logger.log(`👤 userIdFpay: ${user.userIdFpay}`);
            this.logger.log(`👤 Role: ${user.role}`);

            if (user.phone === recipientPhoneOrCode) {
                this.logger.warn(`⚠️ Le payeur et le destinataire ont le même numéro: ${recipientPhoneOrCode}`);
                throw new HttpException(
                    'Vous ne pouvez pas vous payer vous-même',
                    HttpStatus.BAD_REQUEST,
                );
            }

            this.logger.log(`[FpayService] ✅ Paiement:`, {
                payer: {
                    id: user.id,
                    phone: user.phone,
                    userIdFpay: user.userIdFpay,
                    fullName: user.fullName,
                },
                recipient: {
                    phoneOrCode: recipientPhoneOrCode,
                },
                amount: paymentDto.amount,
                currency: paymentDto.currency,
            });

            const url = `${this.fpayApiUrl}/api/external/pay`;

            const paymentData = {
                phone: paymentDto.phone,
                pin: paymentDto.pin,
                toPhoneOrCode: recipientPhoneOrCode,
                amount: paymentDto.amount,
                currency: paymentDto.currency || 'USD',
                description: paymentDto.description || `Paiement vers ${recipientPhoneOrCode}`,
            };

            this.logger.log(`📤 ===== PAYLOAD D'ENVOI =====`);
            this.logger.log(`📤 URL: ${url}`);
            this.logger.log(`📤 Headers: ${JSON.stringify(this.getHeaders(), null, 2)}`);
            this.logger.log(`📤 Payment Data: ${JSON.stringify(paymentData, null, 2)}`);

            const response = await firstValueFrom(
                this.httpService.post<FpayResponse<PaymentResponseDto>>(
                    url,
                    paymentData,
                    { headers: this.getHeaders() }
                )
            );

            this.logger.log(`✅ Payment successful: ${response.data.data.transaction.reference}`);
            return response.data;

        } catch (error) {
            this.logger.error(`Error making payment: ${error.message}`);
            throw this.handleError(error);
        }
    }

    // ✅ makeSend avec FPAY_API_KEY_LOGISTIC
    async makeSend(
        sendDto: FpaySendDto,
        currentUser: UserEntity,
    ): Promise<FpayResponse<PaymentResponseDto>> {
        try {
            if (!currentUser) {
                throw new HttpException(
                    'User not authenticated',
                    HttpStatus.UNAUTHORIZED,
                );
            }

            // ✅ Utiliser la clé API LOGISTIC
            let cleanApiKey = this.logisticApiKey;
            if (cleanApiKey.startsWith('Bearer ')) {
                cleanApiKey = cleanApiKey.substring(7);
                this.logger.log(`🔑 API Key LOGISTIC nettoyée (sans Bearer): ${cleanApiKey.substring(0, 50)}...`);
            }

            this.logger.log(`🔑 ===== CONTENU DE L'API KEY LOGISTIC =====`);
            this.logger.log(`🔑 API Key LOGISTIC (originale): ${this.logisticApiKey.substring(0, 100)}...`);
            this.logger.log(`🔑 API Key LOGISTIC (nettoyée): ${cleanApiKey.substring(0, 100)}...`);

            let recipientPhoneOrCode: string | null = null;
            let decodedPayload: any = null;

            try {
                const apiKeyParts = cleanApiKey.split('.');
                this.logger.log(`🔑 Nombre de parties: ${apiKeyParts.length}`);

                if (apiKeyParts.length === 3) {
                    const headerJson = Buffer.from(apiKeyParts[0], 'base64').toString('utf-8');
                    const header = JSON.parse(headerJson);
                    this.logger.log(`🔑 Header: ${JSON.stringify(header, null, 2)}`);

                    const payloadJson = Buffer.from(apiKeyParts[1], 'base64').toString('utf-8');
                    const payload = JSON.parse(payloadJson);
                    decodedPayload = payload;

                    this.logger.log(`🔑 ===== PAYLOAD DÉCODÉ =====`);
                    this.logger.log(`🔑 Payload complet: ${JSON.stringify(payload, null, 2)}`);

                    this.logger.log(`🔑 sub: ${payload.sub}`);
                    this.logger.log(`🔑 userId: ${payload.userId}`);
                    this.logger.log(`🔑 fullName: ${payload.fullName}`);
                    this.logger.log(`🔑 email: ${payload.email}`);
                    this.logger.log(`🔑 phone: ${payload.phone}`);
                    this.logger.log(`🔑 role: ${payload.role}`);
                    this.logger.log(`🔑 status: ${payload.status}`);
                    this.logger.log(`🔑 merchantCode: ${payload.merchantCode}`);
                    this.logger.log(`🔑 permissions: ${JSON.stringify(payload.permissions)}`);

                    recipientPhoneOrCode = payload.phone || payload.sub;

                    this.logger.log(`🔑 ===== DESTINATAIRE EXTRAIT =====`);
                    this.logger.log(`🔑 Recipient phoneOrCode: ${recipientPhoneOrCode}`);
                } else {
                    this.logger.warn(`⚠️ Format d'API Key LOGISTIC invalide: ${cleanApiKey.substring(0, 30)}...`);
                    this.logger.warn(`⚠️ Nombre de parties: ${apiKeyParts.length}, attendu: 3`);
                }
            } catch (error) {
                this.logger.error(`❌ Erreur lors du décodage de l'API Key LOGISTIC: ${error.message}`);
                this.logger.error(`❌ API Key LOGISTIC (nettoyée): ${cleanApiKey.substring(0, 50)}...`);
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
                    `Client with id ${sendDto.userId} not found`,
                    HttpStatus.NOT_FOUND,
                );
            }

            if (!client.userIdFpay) {
                throw new HttpException(
                    'Client has no FPAY account linked',
                    HttpStatus.BAD_REQUEST,
                );
            }

            this.logger.log(`👤 ===== INFORMATIONS DU CLIENT =====`);
            this.logger.log(`👤 ID: ${client.id}`);
            this.logger.log(`👤 FullName: ${client.fullName}`);
            this.logger.log(`👤 Phone: ${client.phone}`);
            this.logger.log(`👤 userIdFpay: ${client.userIdFpay}`);
            this.logger.log(`👤 Role: ${client.role}`);

            if (client.phone === recipientPhoneOrCode) {
                this.logger.warn(`⚠️ Le client et le destinataire ont le même numéro: ${recipientPhoneOrCode}`);
                throw new HttpException(
                    'Vous ne pouvez pas vous envoyer d\'argent à vous-même',
                    HttpStatus.BAD_REQUEST,
                );
            }

            this.logger.log(`[FpayService] ✅ Envoi avec LOGISTIC:`, {
                client: {
                    id: client.id,
                    phone: client.phone,
                    userIdFpay: client.userIdFpay,
                    fullName: client.fullName,
                },
                recipient: {
                    phoneOrCode: recipientPhoneOrCode,
                },
                amount: sendDto.amount,
                currency: sendDto.currency,
            });

            const url = `${this.fpayApiUrl}/api/external/send`;

            const sendData = {
                userId: sendDto.userId,
                amount: sendDto.amount,
                description: sendDto.description || `Envoi vers ${recipientPhoneOrCode}`,
                currency: sendDto.currency || 'USD',
                countryCode: sendDto.countryCode || 'CD',
            };

            this.logger.log(`📤 ===== PAYLOAD D'ENVOI LOGISTIC =====`);
            this.logger.log(`📤 URL: ${url}`);
            this.logger.log(`📤 Headers: ${JSON.stringify(this.getLogisticHeaders(), null, 2)}`);
            this.logger.log(`📤 Send Data: ${JSON.stringify(sendData, null, 2)}`);

            const response = await firstValueFrom(
                this.httpService.post<FpayResponse<PaymentResponseDto>>(
                    url,
                    sendData,
                    { headers: this.getLogisticHeaders() }
                )
            );

            this.logger.log(`✅ Send LOGISTIC successful: ${response.data.data.transaction.reference}`);
            return response.data;

        } catch (error) {
            this.logger.error(`Error making send LOGISTIC: ${error.message}`);
            throw this.handleError(error);
        }
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
            this.logger.error(`Error processing full payment: ${error.message}`);
            throw error;
        }
    }

    private handleError(error: any): HttpException {
        if (error.response) {
            const status = error.response.status || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = error.response.data?.message || 'FPAY API error';

            this.logger.error(`FPAY API Error: ${status} - ${message}`);

            return new HttpException(
                {
                    statusCode: status,
                    message: message,
                    error: error.response.data,
                    timestamp: new Date().toISOString(),
                },
                status,
            );
        } else if (error.request) {
            this.logger.error('FPAY Service unavailable');
            return new HttpException(
                {
                    statusCode: HttpStatus.SERVICE_UNAVAILABLE,
                    message: 'FPAY service unavailable',
                    timestamp: new Date().toISOString(),
                },
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        } else {
            this.logger.error(`FPAY Error: ${error.message}`);
            return new HttpException(
                {
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    message: error.message || 'Internal server error',
                    timestamp: new Date().toISOString(),
                },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}