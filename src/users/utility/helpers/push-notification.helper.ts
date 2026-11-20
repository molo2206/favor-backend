// src/users/utility/helpers/push-notification.helper.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FcmService } from 'src/notification/fcm.service';
import { MailOrderService } from 'src/email/emailorder.service';
import { UserSettingsEntity } from 'src/users/entities/user-settings.entity';
import { SmsCategory } from '../sms/entity/sms-recharge.entity';
import { SmsQuotaService } from '../sms/sms-quota.service';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class PushNotificationHelper {
  constructor(
    private readonly fcmService: FcmService,
    private readonly smsService: SmsService,
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
    /** ✅ Applications ciblées (x-platform) : ex. ['mobile', 'web'] ; absent = tous les appareils */
    channels?: string[],
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
        channels?.length ? { channels } : undefined,
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
  ): Promise<boolean> {
    // 1) Si userId fourni, vérifier les préférences utilisateur
    if (userId) {
      try {
        const settings = await this.getUserSettings(userId);
        if (!settings.smsNotifications) {
          console.log(
            `[PushHelper] SMS notifications disabled for user ${userId}`,
          );
          return false;
        }
      } catch (error: any) {
        console.error(
          `[PushHelper] Erreur lecture settings pour user ${userId}:`,
          error?.message,
        );
        // On continue quand même l'envoi (best effort)
      }
    }

    // 2) Envoi via SmsService (retourne un boolean)
    try {
      const sent = await this.smsService.sendSms(phoneNumber, message);
      if (!sent) {
        console.error(
          `[PushHelper] SmsService.sendSms a retourné false pour ${phoneNumber} (voir logs SmsService)`,
        );
      }
      return sent === true;
    } catch (error: any) {
      console.error(
        `[PushHelper] SmsService.sendSms exception pour ${phoneNumber}:`,
        error?.message,
      );
      return false;
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
    /** ✅ Push : applications ciblées (x-platform) — ex. ['mobile', 'web'] ; absent = tous les appareils */
    pushChannels?: string[];
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
          options.pushChannels,
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
          const allowed = await this.tryConsumeSmsQuota(
            options.smsCategory,
            options.smsReferenceId,
            options.smsReferenceType || 'PUSH_HELPER',
            options.phoneNumber, // ✅ quota du pays du destinataire
          );

          if (allowed) {
            const smsSent = await this.sendSms(
              options.phoneNumber,
              options.smsBody,
              options.userId,
            );
            if (smsSent) {
              console.log(
                `[PushHelper] ✅ SMS envoyé à ${options.phoneNumber} [${options.smsReferenceType || 'PUSH_HELPER'}]`,
              );
            } else {
              console.warn(
                `[PushHelper] ❌ SMS NON envoyé à ${options.phoneNumber} [${options.smsReferenceType || 'PUSH_HELPER'}]`,
              );
            }
          } else {
            console.warn(
              `[PushHelper] SMS non envoyé (quota ${options.smsCategory} épuisé) à ${options.phoneNumber} [${options.smsReferenceType || 'PUSH_HELPER'}]`,
            );
          }
        } else {
          console.warn(
            `[PushHelper] ⚠️ SMS SANS vérification de quota (pas de smsCategory) à ${options.phoneNumber}`,
          );
          const smsSent = await this.sendSms(
            options.phoneNumber,
            options.smsBody,
            options.userId,
          );
          if (!smsSent) {
            console.warn(
              `[PushHelper] ❌ SMS NON envoyé (sans quota) à ${options.phoneNumber}`,
            );
          }
        }
      } catch (err: any) {
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
    phone?: string | null,
  ): Promise<boolean> {
    try {
      const result = await this.smsQuotaService.tryConsume(category, 1, phone);

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