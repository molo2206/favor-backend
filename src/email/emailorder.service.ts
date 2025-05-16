import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import * as fs from 'fs';
import * as path from 'path';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import ejs from 'ejs';
import puppeteer from 'puppeteer';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';

interface Context {
  user: { fullName: string; email: string };
  order: {
    id: string;
    totalAmount: number;
    currency: string;
    shopType: CompanyActivity;
    invoiceNumber?: string;
    address?: string;
    paymentStatus: string;
  };
  subOrders: SubOrderEntity[];
  subOrdersHtml?: string; // HTML des sous-commandes
  paymentQrCode?: string;
}

@Injectable()
export class MailOrderService {
  constructor(private readonly mailerService: MailerService) {}

  generateSubOrdersHtml(
    subOrders: SubOrderEntity[],
    currency: string,
    shopType: CompanyActivity,
  ): string {
    let counter = 1;

    return subOrders
      .flatMap((subOrder) =>
        subOrder.items.map((item) => {
          const product = item.product;
          const productName = product?.name || 'Produit non disponible';

          let selectedPrice = Number(product?.detail_price_original ?? 0);
          let priceLabel = 'Détail';

          if (
            shopType === CompanyActivity.WHOLESALER ||
            shopType === CompanyActivity.WHOLESALER_RETAILER
          ) {
            selectedPrice = Number(
              product?.gros_price_original ??
                product?.detail_price_original ??
                0,
            );
            priceLabel = product?.gros_price_original ? 'Gros' : 'Détail';
          }

          if (isNaN(selectedPrice)) selectedPrice = 0;

          const totalPrice = selectedPrice * item.quantity;

          return `
        <tr>
          <td>${counter++}</td>
          <td>${productName}</td>
          <td>${item.quantity}</td>
          <td>${selectedPrice.toFixed(2)} ${currency} <small style="color: #6b7280;">(${priceLabel})</small></td>
          <td>${totalPrice.toFixed(2)} ${currency}</td>
        </tr>
      `;
        }),
      )
      .join('');
  }

  async sendHtmlEmail(
    to: string,
    subject: string,
    htmlPageName: string,
    context: Context,
  ) {
    const basePath =
      process.env.NODE_ENV === 'production'
        ? path.join(process.cwd(), 'dist', 'src', 'templates/order')
        : path.join(process.cwd(), 'src', 'templates/order');

    const htmlPath = path.join(basePath, htmlPageName);
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    // Injection conditionnelle du HTML des sous-commandes
    if (
      context.subOrders &&
      context.order?.currency &&
      context.order.shopType &&
      context.order.address &&
      context.order.invoiceNumber &&
      context.order.address &&
      !context.subOrdersHtml
    ) {
      context.subOrdersHtml = this.generateSubOrdersHtml(
        context.subOrders,
        context.order.currency,
        context.order.shopType,
      );
    }

    // Remplacer les variables dans le template
    htmlContent = htmlContent.replace(/{{\s*([\w.]+)\s*}}/g, (_, match) => {
      const keys = match.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let value: any = context;
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          value = '';
          break;
        }
      }
      return typeof value === 'string' ? value : String(value);
    });

    await this.mailerService.sendMail({
      to,
      subject,
      html: htmlContent,
    });
  }

  async generatePdfFromTemplate(
    templateName: string,
    context: any,
  ): Promise<Buffer> {
    const templatePath = path.join(
      process.cwd(),
      process.env.NODE_ENV === 'production'
        ? 'dist/src/templates/order'
        : 'src/templates/order',
      templateName,
    );

    const htmlContent = await ejs.renderFile(templatePath, context, {
      async: true,
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '30px', left: '20px', right: '20px' },
    });

    await browser.close();
    return pdfBuffer;
  }

  async sendInvoiceWithPdf(to: string, subject: string, context: Context) {
    const pdfBuffer = await this.generatePdfFromTemplate('invoice.ejs', {
      ...context,
      subOrdersHtml:
        context.subOrdersHtml ??
        this.generateSubOrdersHtml(
          context.subOrders,
          context.order.currency,
          context.order.shopType,
        ),
    });

    await this.mailerService.sendMail({
      to,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
          <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 20px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.05);">
            <div style="text-align: center; margin-bottom: 20px;">
              <img src="https://cosamed.org/1%20Favor.png" alt="Logo" style="max-width: 200px; height: auto; display: inline-block;" />
            </div>
            <h2 style="color: #1d4ed8; text-align: center;">Votre Facture est Prête</h2>
            <p style="font-size: 16px; line-height: 1.6; color: #333;">Bonjour,</p>
            <p style="font-size: 16px; line-height: 1.6; color: #333;">Veuillez trouver ci-joint votre facture qui est en attente de validation au format PDF.</p>
            <p style="font-size: 14px; color: #999; margin-top: 30px; text-align: center;">
              Merci pour votre confiance,<br/>L’équipe FavorHelp
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: 'facture.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  async sendInvoicePaidWithPdf(to: string, subject: string, context: Context) {
    const pdfBuffer = await this.generatePdfFromTemplate('invoice.ejs', {
      ...context,
      subOrdersHtml:
        context.subOrdersHtml ??
        this.generateSubOrdersHtml(
          context.subOrders,
          context.order.currency,
          context.order.shopType,
        ),
    });

    await this.mailerService.sendMail({
      to,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
          <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 20px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.05);">
            <div style="text-align: center; margin-bottom: 20px;">
              <img src="https://cosamed.org/1%20Favor.png" alt="Logo" style="max-width: 200px; height: auto; display: inline-block;" />
            </div>
            <h2 style="color: #1d4ed8; text-align: center;">Votre Facture payée</h2>
            <p style="font-size: 14px; color: #999; margin-top: 30px; text-align: center;">
              Merci pour votre confiance,<br/>L’équipe FavorHelp
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: 'facture.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  async sendHtmlEmailValidation(
    to: string,
    subject: string,
    htmlPageName: string,
    context: Record<string, any>,
  ) {
    const basePath =
      process.env.NODE_ENV === 'production'
        ? path.join(process.cwd(), 'dist', 'src', 'template')
        : path.join(process.cwd(), 'src', 'templates');

    const htmlPath = path.join(basePath, htmlPageName);

    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    htmlContent = htmlContent.replace(/{{\s*([\w.]+)\s*}}/g, (_, match) => {
      const keys = match.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let value: any = context;
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          value = '';
          break;
        }
      }
      return typeof value === 'string' ? value : String(value);
    });

    await this.mailerService.sendMail({
      to,
      subject,
      html: htmlContent,
    });
  }
  generateSubOrdersByInvoiceNumberHtml(
    subOrders: SubOrderEntity[],
    currency: string,
  ): string {
    let counter = 1;

    const itemsHtml = subOrders
      .flatMap((subOrder) =>
        subOrder.items.map((item) => {
          const productName = item.product?.name || 'Produit non disponible';
          const productPrice = item.product?.price || 0;
          const totalPrice = productPrice * item.quantity;

          return `
          <tr>
              <td>${counter++}</td>
              <td>${productName}</td>
              <td>${item.quantity}</td>
              <td>${productPrice} ${currency}</td>
              <td>${totalPrice} ${currency}</td>
          </tr>
        `;
        }),
      )
      .join('');

    return itemsHtml;
  }
}
