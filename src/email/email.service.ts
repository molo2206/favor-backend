import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import * as fs from 'fs';
import { Context } from 'vm';
import * as path from 'path';
import * as ejs from 'ejs'; // <-- ajoutez cette importation

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) { }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async sendHtmlEmail(
    to: string,
    subject: string,
    htmlPageName: string,
    context: any = {},
  ) {
    const basePath =
      process.env.NODE_ENV === 'production'
        ? path.join(process.cwd(), 'dist', 'src', 'templates/auth')
        : path.join(process.cwd(), 'src', 'templates/auth');

    const templatePath = path.join(basePath, htmlPageName);

    console.log('[MAIL TEMPLATE PATH] =>', templatePath);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template introuvable: ${templatePath}`);
    }

    const htmlContent = (await ejs.renderFile(
      templatePath,
      context,
    )) as string;

    return this.mailerService.sendMail({
      to,
      subject,
      html: htmlContent,
    });
  }

  async sendShipmentPinEmail(
    to: string,
    shipmentData: {
      clientName: string;
      pinCode: string;
      trackingNumber: string;
      shipmentReference: string;
      weight: string;
      dimensions: string;
      packageType: string;
      totalPrice: string;
      year: number;
      user: any;
      order: any;
    },
  ) {
    // Extraire user et order, garder le reste
    const { user, order, ...rest } = shipmentData;

    const context: Context = {
      user,
      order,
      subOrders: [],
      ...rest, // Toutes les autres propriétés (clientName, pinCode, etc.)
    };

    return this.sendHtmlEmail(
      to,
      ' Votre code PIN pour réceptionner votre colis FavorHelp',
      'colis-pin.html',
      context,
    );
  }

  // mail.service.ts (ajouter cette méthode)
  async sendEmailWithPdf(
    to: string,
    subject: string,
    pdfBuffer: Buffer,
    pdfFilename: string,
    htmlPageName: string,
    context: any = {},
  ) {
    const basePath =
      process.env.NODE_ENV === 'production'
        ? path.join(process.cwd(), 'dist', 'src', 'templates/auth')
        : path.join(process.cwd(), 'src', 'templates/auth');

    const htmlPath = path.join(basePath, htmlPageName);
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    // Remplacer les variables
    htmlContent = htmlContent.replace(/{{\s*([\w.]+)\s*}}/g, (_, match) => {
      const keys = match.split('.');
      let value = context;
      for (const key of keys) {
        if (value && key in value) {
          value = value[key];
        } else {
          value = undefined;
          break;
        }
      }
      return value !== undefined ? value : '';
    });

    await this.mailerService.sendMail({
      to,
      subject,
      html: htmlContent,
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }
}
