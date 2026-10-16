// // src/users/utility/helpers/push-notification.helper.ts
// import { Injectable } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { FcmService } from 'src/notification/fcm.service';
// import { SmsHelper } from './sms.helper';
// import { WhatsAppHelper } from 'src/whatsapp/whatsapp-helper.service'; // ← AJOUT
// import { MailOrderService } from 'src/email/emailorder.service';
// import { UserSettingsEntity } from 'src/users/entities/user-settings.entity';

// @Injectable()
// export class PushNotificationHelper {
//   constructor(
//     private readonly fcmService: FcmService,
//     private readonly smsHelper: SmsHelper,
//     private readonly whatsAppHelper: WhatsAppHelper, // ← NOUVEAU
//     private readonly mailOrderService: MailOrderService,
//     @InjectRepository(UserSettingsEntity)
//     private readonly settingsRepo: Repository<UserSettingsEntity>,
//   ) { }

//   private async getUserSettings(userId: string): Promise<UserSettingsEntity> {
//     let settings = await this.settingsRepo.findOne({ where: { userId } });
//     if (!settings) {
//       settings = this.settingsRepo.create({ userId });
//       await this.settingsRepo.save(settings);
//     }
//     return settings;
//   }

//   async sendPush(
//     userId: string,
//     title: string,
//     body: string,
//     data?: Record<string, string>,
//     imageUrl?: string,
//   ): Promise<void> {
//     console.log(`sendPush called for user ${userId}, title: ${title}`);
//     try {
//       const settings = await this.getUserSettings(userId);
//       if (!settings.pushNotifications) {
//         console.log(`[PushHelper] Push notifications disabled for user ${userId}`);
//         return;
//       }
//       const filteredData: Record<string, string> = {};
//       if (data) {
//         if (data.entity) filteredData.entity = data.entity;
//         if (data.entityId) filteredData.entityId = data.entityId;
//       }
//       await this.fcmService.sendPushNotification(
//         userId,
//         title,
//         body,
//         filteredData,
//         imageUrl,
//       );
//     } catch (error) {
//       console.error(`[PushHelper] Push failed:`, error.message);
//     }
//   }

//   async sendSms(
//     phoneNumber: string,
//     message: string,
//     userId?: string,
//   ): Promise<void> {
//     if (!userId) {
//       try {
//         await this.smsHelper.sendSms(phoneNumber, message);
//       } catch (error) {
//         console.error(
//           `[PushHelper] SMS failed to ${phoneNumber}:`,
//           error.message,
//         );
//       }
//       return;
//     }
//     try {
//       const settings = await this.getUserSettings(userId);
//       if (!settings.smsNotifications) {
//         console.log(
//           `[PushHelper] SMS notifications disabled for user ${userId}`,
//         );
//         return;
//       }
//       await this.smsHelper.sendSms(phoneNumber, message);
//     } catch (error) {
//       console.error(
//         `[PushHelper] SMS failed to ${phoneNumber}:`,
//         error.message,
//       );
//     }
//   }

//   // ==================== NOUVEAU : WHATSAPP ====================
//   async sendWhatsApp(
//     phoneNumber: string,
//     message: string,
//     userId?: string,
//     imageUrl?: string,
//   ): Promise<void> {
//     if (!userId) {
//       try {
//         if (imageUrl) {
//           await this.whatsAppHelper.sendImageMessage(phoneNumber, imageUrl, message);
//         } else {
//           await this.whatsAppHelper.sendTextMessage(phoneNumber, message);
//         }
//       } catch (error) {
//         console.error(
//           `[PushHelper] WhatsApp failed to ${phoneNumber}:`,
//           error.message,
//         );
//       }
//       return;
//     }
//     try {
//       const settings = await this.getUserSettings(userId);
//       if (!settings.whatsappNotifications) { // Nécessite l'ajout d'un champ dans UserSettingsEntity
//         console.log(
//           `[PushHelper] WhatsApp notifications disabled for user ${userId}`,
//         );
//         return;
//       }
//       if (imageUrl) {
//         await this.whatsAppHelper.sendImageMessage(phoneNumber, imageUrl, message);
//       } else {
//         await this.whatsAppHelper.sendTextMessage(phoneNumber, message);
//       }
//     } catch (error) {
//       console.error(
//         `[PushHelper] WhatsApp failed to ${phoneNumber}:`,
//         error.message,
//       );
//     }
//   }

//   async sendEmail(
//     to: string,
//     subject: string,
//     template: string,
//     context: any,
//     userId?: string,
//   ): Promise<void> {
//     if (!userId) {
//       try {
//         await this.mailOrderService.sendHtmlEmail(
//           to,
//           subject,
//           template,
//           context,
//         );
//       } catch (error) {
//         console.error(`[PushHelper] Email failed to ${to}:`, error.message);
//       }
//       return;
//     }
//     try {
//       const settings = await this.getUserSettings(userId);
//       if (!settings.emailNotifications) {
//         console.log(
//           `[PushHelper] Email notifications disabled for user ${userId}`,
//         );
//         return;
//       }
//       await this.mailOrderService.sendHtmlEmail(to, subject, template, context);
//     } catch (error) {
//       console.error(`[PushHelper] Email failed to ${to}:`, error.message);
//     }
//   }

//   async sendEmailWithPdf(
//     to: string,
//     subject: string,
//     context: any,
//     userId?: string,
//   ): Promise<void> {
//     if (!userId) {
//       try {
//         await this.mailOrderService.sendInvoicePaidWithPdf(
//           to,
//           subject,
//           context,
//         );
//       } catch (error) {
//         console.error(
//           `[PushHelper] Email with PDF (paid) failed to ${to}:`,
//           error.message,
//         );
//       }
//       return;
//     }
//     try {
//       const settings = await this.getUserSettings(userId);
//       if (!settings.emailNotifications) {
//         console.log(
//           `[PushHelper] Email notifications disabled for user ${userId}`,
//         );
//         return;
//       }
//       await this.mailOrderService.sendInvoicePaidWithPdf(to, subject, context);
//     } catch (error) {
//       console.error(
//         `[PushHelper] Email with PDF (paid) failed to ${to}:`,
//         error.message,
//       );
//     }
//   }

//   async sendSimpleInvoiceWithPdf(
//     to: string,
//     subject: string,
//     context: any,
//     userId?: string,
//   ): Promise<void> {
//     if (!userId) {
//       try {
//         await this.mailOrderService.sendInvoiceWithPdf(to, subject, context);
//       } catch (error) {
//         console.error(
//           `[PushHelper] Email with simple invoice PDF failed to ${to}:`,
//           error.message,
//         );
//       }
//       return;
//     }
//     try {
//       const settings = await this.getUserSettings(userId);
//       if (!settings.emailNotifications) {
//         console.log(
//           `[PushHelper] Email notifications disabled for user ${userId}`,
//         );
//         return;
//       }
//       await this.mailOrderService.sendInvoiceWithPdf(to, subject, context);
//     } catch (error) {
//       console.error(
//         `[PushHelper] Email with simple invoice PDF failed to ${to}:`,
//         error.message,
//       );
//     }
//   }

//   async sendShipmentPdfEmail(
//     to: string,
//     subject: string,
//     context: any,
//     userId?: string,
//   ): Promise<void> {
//     if (!userId) {
//       try {
//         await this.mailOrderService.sendShipmentPdf(to, subject, context);
//       } catch (error) {
//         console.error(
//           `[PushHelper] Shipment email with PDF failed to ${to}:`,
//           error.message,
//         );
//       }
//       return;
//     }
//     try {
//       const settings = await this.getUserSettings(userId);
//       if (!settings.emailNotifications) {
//         console.log(
//           `[PushHelper] Email notifications disabled for user ${userId}`,
//         );
//         return;
//       }
//       await this.mailOrderService.sendShipmentPdf(to, subject, context);
//     } catch (error) {
//       console.error(
//         `[PushHelper] Shipment email with PDF failed to ${to}:`,
//         error.message,
//       );
//     }
//   }

//   async sendAll(options: {
//     userId?: string;
//     pushTitle?: string;
//     pushBody?: string;
//     pushData?: Record<string, string>;
//     imageUrl?: string;
//     phoneNumber?: string;
//     smsBody?: string;
//     whatsappNumber?: string;   // ← AJOUT
//     whatsappBody?: string;     // ← AJOUT
//     whatsappImageUrl?: string; // ← AJOUT (optionnel)
//     emailTo?: string;
//     emailSubject?: string;
//     emailTemplate?: string;
//     emailContext?: any;
//     sendInvoicePaidWithPdf?: boolean;
//     sendInvoiceWithPdf?: boolean;
//     sendShipmentPdf?: boolean;
//   }): Promise<void> {
//     if (options.userId && options.pushTitle && options.pushBody) {
//       await this.sendPush(
//         options.userId,
//         options.pushTitle,
//         options.pushBody,
//         options.pushData,
//         options.imageUrl,
//       );
//     }

//     if (options.phoneNumber && options.smsBody) {
//       await this.sendSms(options.phoneNumber, options.smsBody, options.userId);
//     }

//     // ==================== NOUVEAU : WHATSAPP ====================
//     if (options.whatsappNumber && options.whatsappBody) {
//       await this.sendWhatsApp(
//         options.whatsappNumber,
//         options.whatsappBody,
//         options.userId,
//         options.whatsappImageUrl,
//       );
//     }

//     if (options.emailTo && options.emailSubject) {
//       if (options.sendShipmentPdf) {
//         await this.sendShipmentPdfEmail(
//           options.emailTo,
//           options.emailSubject,
//           options.emailContext,
//           options.userId,
//         );
//       } else if (options.sendInvoicePaidWithPdf) {
//         await this.sendEmailWithPdf(
//           options.emailTo,
//           options.emailSubject,
//           options.emailContext,
//           options.userId,
//         );
//       } else if (options.sendInvoiceWithPdf) {
//         await this.sendSimpleInvoiceWithPdf(
//           options.emailTo,
//           options.emailSubject,
//           options.emailContext,
//           options.userId,
//         );
//       } else if (options.emailTemplate) {
//         await this.sendEmail(
//           options.emailTo,
//           options.emailSubject,
//           options.emailTemplate,
//           options.emailContext,
//           options.userId,
//         );
//       }
//     }
//   }
// }


// src/users/utility/helpers/push-notification.helper.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FcmService } from 'src/notification/fcm.service';
import { SmsHelper } from './sms.helper';
import { MailOrderService } from 'src/email/emailorder.service';
import { UserSettingsEntity } from 'src/users/entities/user-settings.entity';
import { SmsCategory } from '../sms/entity/sms-recharge.entity';
import { SmsQuotaService } from '../sms/sms-quota.service';

@Injectable()
export class PushNotificationHelper {
  constructor(
    private readonly fcmService: FcmService,
    private readonly smsHelper: SmsHelper,
    private readonly mailOrderService: MailOrderService,
    @InjectRepository(UserSettingsEntity)
    private readonly settingsRepo: Repository<UserSettingsEntity>,
    private readonly smsQuotaService: SmsQuotaService,
  ) { }

  private async getUserSettings(userId: string): Promise<UserSettingsEntity> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = this.settingsRepo.create({ userId });
      await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    imageUrl?: string,
  ): Promise<void> {
    console.log(`sendPush called for user ${userId}, title: ${title}`);
    try {
      const settings = await this.getUserSettings(userId);
      if (!settings.pushNotifications) {
        console.log(`[PushHelper] Push notifications disabled for user ${userId}`);
        return;
      }
      const filteredData: Record<string, string> = {};
      if (data) {
        if (data.entity) filteredData.entity = data.entity;
        if (data.entityId) filteredData.entityId = data.entityId;
      }
      await this.fcmService.sendPushNotification(
        userId,
        title,
        body,
        filteredData,
        imageUrl,
      );
    } catch (error) {
      console.error(`[PushHelper] Push failed:`, error.message);
    }
  }

  /**
 * ✅ Envoi SMS en mode BEST EFFORT.
 * Ne throw JAMAIS. Log et continue quoi qu'il arrive.
 * La vérification du quota est faite EN AMONT dans `sendAll`.
 */
  async sendSms(
    phoneNumber: string,
    message: string,
    userId?: string,
  ): Promise<void> {
    if (!userId) {
      try {
        await this.smsHelper.sendSms(phoneNumber, message);
      } catch (error: any) {
        console.error(
          `[PushHelper] SMS failed to ${phoneNumber} (ignoré):`,
          error?.message,
        );
      }
      return;
    }
    try {
      const settings = await this.getUserSettings(userId);
      if (!settings.smsNotifications) {
        console.log(
          `[PushHelper] SMS notifications disabled for user ${userId}`,
        );
        return;
      }
      await this.smsHelper.sendSms(phoneNumber, message);
    } catch (error: any) {
      // ✅ Best effort : on log et on continue
      console.error(
        `[PushHelper] SMS failed to ${phoneNumber} (ignoré):`,
        error?.message,
      );
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    template: string,
    context: any,
    userId?: string,
  ): Promise<void> {
    if (!userId) {
      try {
        await this.mailOrderService.sendHtmlEmail(
          to,
          subject,
          template,
          context,
        );
      } catch (error) {
        console.error(`[PushHelper] Email failed to ${to}:`, error.message);
      }
      return;
    }
    try {
      const settings = await this.getUserSettings(userId);
      if (!settings.emailNotifications) {
        console.log(
          `[PushHelper] Email notifications disabled for user ${userId}`,
        );
        return;
      }
      await this.mailOrderService.sendHtmlEmail(to, subject, template, context);
    } catch (error) {
      console.error(`[PushHelper] Email failed to ${to}:`, error.message);
    }
  }

  async sendEmailWithPdf(
    to: string,
    subject: string,
    context: any,
    userId?: string,
  ): Promise<void> {
    if (!userId) {
      try {
        await this.mailOrderService.sendInvoicePaidWithPdf(
          to,
          subject,
          context,
        );
      } catch (error) {
        console.error(
          `[PushHelper] Email with PDF (paid) failed to ${to}:`,
          error.message,
        );
      }
      return;
    }
    try {
      const settings = await this.getUserSettings(userId);
      if (!settings.emailNotifications) {
        console.log(
          `[PushHelper] Email notifications disabled for user ${userId}`,
        );
        return;
      }
      await this.mailOrderService.sendInvoicePaidWithPdf(to, subject, context);
    } catch (error) {
      console.error(
        `[PushHelper] Email with PDF (paid) failed to ${to}:`,
        error.message,
      );
    }
  }

  async sendSimpleInvoiceWithPdf(
    to: string,
    subject: string,
    context: any,
    userId?: string,
  ): Promise<void> {
    if (!userId) {
      try {
        await this.mailOrderService.sendInvoiceWithPdf(to, subject, context);
      } catch (error) {
        console.error(
          `[PushHelper] Email with simple invoice PDF failed to ${to}:`,
          error.message,
        );
      }
      return;
    }
    try {
      const settings = await this.getUserSettings(userId);
      if (!settings.emailNotifications) {
        console.log(
          `[PushHelper] Email notifications disabled for user ${userId}`,
        );
        return;
      }
      await this.mailOrderService.sendInvoiceWithPdf(to, subject, context);
    } catch (error) {
      console.error(
        `[PushHelper] Email with simple invoice PDF failed to ${to}:`,
        error.message,
      );
    }
  }

  async sendShipmentPdfEmail(
    to: string,
    subject: string,
    context: any,
    userId?: string,
  ): Promise<void> {
    if (!userId) {
      try {
        await this.mailOrderService.sendShipmentPdf(to, subject, context);
      } catch (error) {
        console.error(
          `[PushHelper] Shipment email with PDF failed to ${to}:`,
          error.message,
        );
      }
      return;
    }
    try {
      const settings = await this.getUserSettings(userId);
      if (!settings.emailNotifications) {
        console.log(
          `[PushHelper] Email notifications disabled for user ${userId}`,
        );
        return;
      }
      await this.mailOrderService.sendShipmentPdf(to, subject, context);
    } catch (error) {
      console.error(
        `[PushHelper] Shipment email with PDF failed to ${to}:`,
        error.message,
      );
    }
  }

  async sendAll(options: {
    userId?: string;
    pushTitle?: string;
    pushBody?: string;
    pushData?: Record<string, string>;
    imageUrl?: string;
    phoneNumber?: string;
    smsBody?: string;
    smsCategory?: SmsCategory;              // ✅ AJOUT
    smsReferenceId?: string;                // ✅ AJOUT
    smsReferenceType?: string;              // ✅ AJOUT
    emailTo?: string;
    emailSubject?: string;
    emailTemplate?: string;
    emailContext?: any;
    sendInvoicePaidWithPdf?: boolean;
    sendInvoiceWithPdf?: boolean;
    sendShipmentPdf?: boolean;
  }): Promise<void> {
    // ============================================================
    // 1. PUSH (best effort — déjà try/catch dans sendPush)
    // ============================================================
    if (options.userId && options.pushTitle && options.pushBody) {
      try {
        await this.sendPush(
          options.userId,
          options.pushTitle,
          options.pushBody,
          options.pushData,
          options.imageUrl,
        );
      } catch (err: any) {
        console.error(`[PushHelper] sendPush error (ignoré):`, err?.message);
      }
    }

    // ============================================================
    // 2. SMS — BEST EFFORT : ne bloque JAMAIS le flux
    //    - Si quota OK    → SMS envoyé
    //    - Si quota épuisé → log + continue (push/email continuent)
    //    - Si erreur tech  → log + continue
    // ============================================================
    if (options.phoneNumber && options.smsBody) {
      try {
        if (options.smsCategory) {
          // ✅ Vérification du quota — mais on ne bloque JAMAIS
          const allowed = await this.tryConsumeSmsQuota(
            options.smsCategory,
            options.smsReferenceId,
            options.smsReferenceType || 'PUSH_HELPER',
          );

          if (allowed) {
            await this.sendSms(
              options.phoneNumber,
              options.smsBody,
              options.userId,
            );
            console.log(
              `[PushHelper] SMS envoyé à ${options.phoneNumber} [${options.smsReferenceType || 'PUSH_HELPER'}]`,
            );
          } else {
            // ✅ Best effort : on log et on NE throw PAS
            console.warn(
              `[PushHelper] SMS non envoyé (quota ${options.smsCategory} épuisé) à ${options.phoneNumber} [${options.smsReferenceType || 'PUSH_HELPER'}]`,
            );
          }
        } else {
          // Pas de catégorie → envoi direct (avec warning)
          console.warn(
            `[PushHelper] ⚠️ SMS envoyé SANS vérification de quota (pas de smsCategory) à ${options.phoneNumber}`,
          );
          await this.sendSms(
            options.phoneNumber,
            options.smsBody,
            options.userId,
          );
        }
      } catch (err: any) {
        // ✅ Filet de sécurité : aucune erreur SMS ne doit bloquer le flux
        console.error(
          `[PushHelper] SMS error (ignorée) pour ${options.phoneNumber}:`,
          err?.message,
        );
      }
    }

    // ============================================================
    // 3. EMAIL (best effort — déjà try/catch dans les méthodes)
    // ============================================================
    if (options.emailTo && options.emailSubject) {
      try {
        if (options.sendShipmentPdf) {
          await this.sendShipmentPdfEmail(
            options.emailTo,
            options.emailSubject,
            options.emailContext,
            options.userId,
          );
        } else if (options.sendInvoicePaidWithPdf) {
          await this.sendEmailWithPdf(
            options.emailTo,
            options.emailSubject,
            options.emailContext,
            options.userId,
          );
        } else if (options.sendInvoiceWithPdf) {
          await this.sendSimpleInvoiceWithPdf(
            options.emailTo,
            options.emailSubject,
            options.emailContext,
            options.userId,
          );
        } else if (options.emailTemplate) {
          await this.sendEmail(
            options.emailTo,
            options.emailSubject,
            options.emailTemplate,
            options.emailContext,
            options.userId,
          );
        }
      } catch (err: any) {
        console.error(
          `[PushHelper] Email error (ignorée) pour ${options.emailTo}:`,
          err?.message,
        );
      }
    }
  }

  /**
 * ✅ Vérifie et consomme 1 SMS du quota.
 * Retourne true si le SMS peut être envoyé, false sinon.
 *
 * ⚠️ Un retour `false` NE DOIT PAS bloquer le flux appelant.
 * Il indique juste que le SMS ne sera pas envoyé.
 */
  private async tryConsumeSmsQuota(
    category: SmsCategory,
    referenceId: string | undefined,
    referenceType: string,
  ): Promise<boolean> {
    try {
      const result = await this.smsQuotaService.tryConsume(category, 1);

      if (!result.allowed) {
        console.warn(
          `[PushHelper] Quota ${category} épuisé (remaining: ${result.quotaBefore}) -> SMS non envoyé [${referenceType}]`,
        );
        return false;
      }

      console.log(
        `[PushHelper] Quota ${category} décompté (avant: ${result.quotaBefore}, après: ${result.quotaAfter}) [${referenceType}]`,
      );
      return true;
    } catch (error: any) {
      // ⚠️ En cas d'erreur technique, on ne bloque pas non plus.
      console.error(
        `[PushHelper] Erreur quota SMS (ignorée) [${referenceType}]:`,
        error?.message,
      );
      return false;
    }
  }
}