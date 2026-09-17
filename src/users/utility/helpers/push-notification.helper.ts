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

@Injectable()
export class PushNotificationHelper {
  constructor(
    private readonly fcmService: FcmService,
    private readonly smsHelper: SmsHelper,
    private readonly mailOrderService: MailOrderService,
    @InjectRepository(UserSettingsEntity)
    private readonly settingsRepo: Repository<UserSettingsEntity>,
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

  async sendSms(
    phoneNumber: string,
    message: string,
    userId?: string,
  ): Promise<void> {
    if (!userId) {
      try {
        await this.smsHelper.sendSms(phoneNumber, message);
      } catch (error) {
        console.error(
          `[PushHelper] SMS failed to ${phoneNumber}:`,
          error.message,
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
    } catch (error) {
      console.error(
        `[PushHelper] SMS failed to ${phoneNumber}:`,
        error.message,
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
    emailTo?: string;
    emailSubject?: string;
    emailTemplate?: string;
    emailContext?: any;
    sendInvoicePaidWithPdf?: boolean;
    sendInvoiceWithPdf?: boolean;
    sendShipmentPdf?: boolean;
  }): Promise<void> {
    if (options.userId && options.pushTitle && options.pushBody) {
      await this.sendPush(
        options.userId,
        options.pushTitle,
        options.pushBody,
        options.pushData,
        options.imageUrl,
      );
    }

    if (options.phoneNumber && options.smsBody) {
      await this.sendSms(options.phoneNumber, options.smsBody, options.userId);
    }

    if (options.emailTo && options.emailSubject) {
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
    }
  }
}