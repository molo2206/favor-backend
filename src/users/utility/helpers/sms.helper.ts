import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmsHelper {
  private readonly logger = new Logger(SmsHelper.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Envoie un SMS à un numéro donné
   * @param to Numéro de téléphone au format international (+243…)
   * @param message Contenu du SMS
   * @returns boolean (true si l’envoi est réussi, false sinon)
   */
  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      const url = this.configService.get<string>('KECCEL_APP_URL');
      const token = this.configService.get<string>('KECCEL_TOKEN');
      const sender = this.configService.get<string>('KECCEL_SENDER_ID');

      if (!url || !token || !sender) {
        throw new Error(
          'Variables KECCEL_APP_URL, KECCEL_TOKEN ou KECCEL_SENDER_ID non définies.',
        );
      }

      await axios.post(url, {
        token,
        from: sender,
        to,
        message,
      });

      this.logger.log(`SMS envoyé avec succès à ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Échec d'envoi du SMS à ${to}`, error.message);
      return false;
    }
  }
}
