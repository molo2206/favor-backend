import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

// Interface de réponse Dream Digital
interface DreamDigitalSmsResponse {
  status: string;        // 'S' pour succès, 'E' pour erreur
  message_id?: string;   // ID du message (présent en cas de succès)
  description?: string;  // Description de l'erreur (en cas d'échec)
}

@Injectable()
export class SmsHelper {
  private readonly logger = new Logger(SmsHelper.name);
  private readonly apiId: string;
  private readonly apiPassword: string;
  private readonly sender: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    // ✅ Utiliser les variables d'environnement avec fallback
    this.apiId = this.configService.get<string>('DREAM_API_ID') || 'API41116697559';
    this.apiPassword = this.configService.get<string>('DREAM_API_PASSWORD') || 'V2nOnixFDv';
    this.sender = this.configService.get<string>('DREAM_SENDER_ID') || 'FAVORHELP';
    this.apiUrl = this.configService.get<string>('DREAM_API_URL') || 'https://api2.dream-digital.info/api/SendSMS';
  }

  /**
   * Envoie un SMS à un numéro donné (système Dream Digital)
   * @param to Numéro de téléphone au format international (+243…)
   * @param message Contenu du SMS
   * @returns boolean (true si l’envoi est réussi, false sinon)
   */
  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      // Normaliser le numéro
      let cleanPhone = to.replace(/[^0-9]/g, '');

      // S'assurer que le numéro commence par 243
      if (!cleanPhone.startsWith('243')) {
        if (cleanPhone.startsWith('0')) {
          cleanPhone = `243${cleanPhone.substring(1)}`;
        } else {
          cleanPhone = `243${cleanPhone}`;
        }
      }

      // S'assurer que le numéro fait exactement 12 chiffres
      if (cleanPhone.length !== 12) {
        this.logger.error(`❌ Numéro invalide: ${cleanPhone} (doit faire 12 chiffres)`);
        return false;
      }

      // Construire l'URL avec les paramètres Dream Digital
      const url = `${this.apiUrl}?api_id=${this.apiId}&api_password=${this.apiPassword}&sms_type=T&encoding=T&sender_id=${this.sender}&phonenumber=${cleanPhone}&textmessage=${encodeURIComponent(message)}`;

      this.logger.log(`📤 Envoi SMS à ${to}`);
      this.logger.debug(`URL: ${url.replace(this.apiPassword, '***')}`);

      // Envoyer la requête
      const response = await axios.get<DreamDigitalSmsResponse>(url, {
        timeout: 30000,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      this.logger.debug(`📥 Réponse API:`, response.data);

      // Vérifier la réponse
      if (response.data && response.data.status === 'S') {
        this.logger.log(`✅ SMS envoyé avec succès à ${to} (ID: ${response.data.message_id || 'N/A'})`);
        return true;
      } else {
        this.logger.error(`❌ Échec envoi SMS à ${to}:`, response.data?.description || response.data);
        return false;
      }
    } catch (error) {
      this.logger.error(`❌ Erreur lors de l'envoi SMS à ${to}:`, error.message);
      if (error.response) {
        this.logger.error(`   Status: ${error.response.status}`);
        this.logger.error(`   Data:`, error.response.data);
      }
      return false;
    }
  }

  /**
   * Envoie un OTP par SMS
   */
  async sendOtpSms(phoneNumber: string, otpCode: string): Promise<boolean> {
    const message = `Votre code de vérification AccesPay est : ${otpCode}. Valable 10 minutes.`;
    return this.sendSms(phoneNumber, message);
  }

  /**
   * Envoie un SMS de bienvenue
   */
  async sendWelcomeSms(
    phoneNumber: string,
    fullName: string,
    accountNumber: string,
  ): Promise<boolean> {
    const message = `Bienvenue sur AccesPay, ${fullName} ! Votre compte ${accountNumber} a été créé avec succès.`;
    return this.sendSms(phoneNumber, message);
  }
}