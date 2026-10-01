// import { Injectable, Logger } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import axios, { AxiosInstance } from 'axios';

// @Injectable()
// export class WhatsAppHelper {
//     private readonly logger = new Logger(WhatsAppHelper.name);
//     private readonly client: AxiosInstance;
//     private readonly phoneNumberId: string;
//     private readonly apiVersion: string;

//     constructor(private readonly configService: ConfigService) {
//         const token = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
//         const phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID');
//         const apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION') || 'v18.0';

//         if (!token || !phoneNumberId) {
//             throw new Error(
//                 'WhatsApp credentials missing: WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be defined in .env',
//             );
//         }

//         this.phoneNumberId = phoneNumberId;
//         this.apiVersion = apiVersion;

//         this.client = axios.create({
//             baseURL: `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
//             headers: {
//                 Authorization: `Bearer ${token}`,
//                 'Content-Type': 'application/json',
//             },
//         });
//     }
//     /**
//      * Envoie un message texte via WhatsApp
//      * @param to - Numéro de téléphone international (ex: +243XXXXXXXXX)
//      * @param message - Contenu du message (texte brut)
//      * @returns true si succès, false si erreur
//      */
//     async sendTextMessage(to: string, message: string): Promise<boolean> {
//         try {
//             const payload = {
//                 messaging_product: 'whatsapp',
//                 recipient_type: 'individual',
//                 to,
//                 type: 'text',
//                 text: { preview_url: false, body: message },
//             };

//             const response = await this.client.post('', payload);
//             this.logger.log(`WhatsApp message sent to ${to} (id: ${response.data.messages?.[0]?.id})`);
//             return true;
//         } catch (error) {
//             this.logger.error(`WhatsApp send error to ${to}: ${error.response?.data?.error?.message || error.message}`);
//             return false;
//         }
//     }

//     /**
//      * Envoie un message template pré-approuvé par WhatsApp
//      * @param to - Numéro destinataire
//      * @param templateName - Nom du template (ex: "hello_world")
//      * @param languageCode - Code langue (ex: "fr", "en")
//      * @param components - Composants optionnels du template (ex: boutons, corps)
//      */
//     async sendTemplateMessage(
//         to: string,
//         templateName: string,
//         languageCode: string = 'fr',
//         components?: any[],
//     ): Promise<boolean> {
//         try {
//             const payload: any = {
//                 messaging_product: 'whatsapp',
//                 recipient_type: 'individual',
//                 to,
//                 type: 'template',
//                 template: {
//                     name: templateName,
//                     language: { code: languageCode },
//                 },
//             };
//             if (components && components.length) {
//                 payload.template.components = components;
//             }

//             const response = await this.client.post('', payload);
//             this.logger.log(`WhatsApp template sent to ${to} (id: ${response.data.messages?.[0]?.id})`);
//             return true;
//         } catch (error) {
//             this.logger.error(`WhatsApp template error to ${to}: ${error.response?.data?.error?.message || error.message}`);
//             return false;
//         }
//     }

//     /**
//      * Envoie un message avec une image (URL)
//      * @param to - Numéro destinataire
//      * @param imageUrl - URL publique de l'image
//      * @param caption - Légende optionnelle
//      */
//     async sendImageMessage(to: string, imageUrl: string, caption?: string): Promise<boolean> {
//         try {
//             const payload: any = {
//                 messaging_product: 'whatsapp',
//                 recipient_type: 'individual',
//                 to,
//                 type: 'image',
//                 image: { link: imageUrl },
//             };
//             if (caption) payload.image.caption = caption;

//             const response = await this.client.post('', payload);
//             this.logger.log(`WhatsApp image sent to ${to} (id: ${response.data.messages?.[0]?.id})`);
//             return true;
//         } catch (error) {
//             this.logger.error(`WhatsApp image error to ${to}: ${error.response?.data?.error?.message || error.message}`);
//             return false;
//         }
//     }
// }