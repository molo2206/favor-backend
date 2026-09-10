/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import * as fs from 'fs';
import * as path from 'path';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import ejs from 'ejs';
import puppeteer from 'puppeteer';
import { OrderEntity } from 'src/order/entities/order.entity';
import { I18nService } from 'src/libs/common/src';

interface Context {
  user: {
    fullName: string;
    email: string;
    phone?: string;
    city?: string;
    country?: string;
    [key: string]: any;
  };
  order:
  | OrderEntity
  | {
    id: string;
    totalAmount: number;
    shippingCost?: number;
    currency: string;
    invoiceNumber?: string;
    paymentStatus?: string;
    type?: string;
    shopType?: string;
    pin?: string;
    createdAt?: Date;
    addressUser?: {
      address?: string;
      city?: string;
      country?: string;
    };
    [key: string]: any;
  };
  subOrders: SubOrderEntity[];
  subOrdersHtml?: string;
  paymentQrCode?: string;
}

@Injectable()
export class MailOrderService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly i18n: I18nService,
  ) { }

  async generateSubOrdersHtml(subOrders: SubOrderEntity[], currency: string, lang: string = 'fr'): Promise<string> {
    let counter = 1;
    const productNotAvailable = await this.i18n.translate('order.product_not_available', lang);
    return subOrders
      .flatMap((subOrder) =>
        subOrder.items.map((item) => {
          const product = item.product;
          const productName = product?.name || productNotAvailable;
          const totalPrice = item.price * item.quantity;
          return `
      <tr>
        <td>${counter++}</td>
        <td>${productName}</td>
        <td>${item.quantity}</td>
        <td>${item.price} ${currency}</td>
        <td>${totalPrice} ${currency}</td>
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
    lang: string = 'fr',
  ) {
    const basePath =
      process.env.NODE_ENV === 'production'
        ? path.join(process.cwd(), 'dist', 'src', 'templates/order')
        : path.join(process.cwd(), 'src', 'templates/order');

    const htmlPath = path.join(basePath, htmlPageName);
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    if (
      context.subOrders?.length &&
      context.order?.currency &&
      context.order.addressUser?.address &&
      context.order.invoiceNumber &&
      context.order.paymentStatus &&
      !context.subOrdersHtml
    ) {
      context.subOrdersHtml = await this.generateSubOrdersHtml(
        context.subOrders,
        context.order.currency,
        lang,
      );
    }

    // Remplacer les variables dans le template ({{ ... }})
    htmlContent = htmlContent.replace(/{{\s*([\w.]+)\s*}}/g, (_, match) => {
      const keys = match.split('.');
      let value: unknown = context;
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = (value as any)[key];
        } else {
          value = '';
          break;
        }
      }
      return value != null ? String(value) : '';
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
    const htmlContent = await ejs.renderFile(templatePath, context, { async: true });
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

  async sendInvoiceCarWithPdf(to: string, subject: string, context: Context, lang: string = 'fr') {
    const pdfBuffer = await this.generatePdfFromTemplate('invoice.car.ejs', {
      ...context,
      subOrdersHtml: null,
    });

    const logoUrl = 'https://cosamed.org/1%20Favor.png';
    const title = await this.i18n.translate('order.email.car_invoice_ready', lang);
    const greeting = await this.i18n.translate('order.email.greeting_short', lang);
    const message = await this.i18n.translate('order.email.car_invoice_body', lang);
    const thanks = await this.i18n.translate('order.email.thanks_team', lang);

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; padding: 20px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.05);">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="${logoUrl}" alt="Logo" style="max-width: 200px; height: auto; display: inline-block;" />
          </div>
          <h2 style="color: #1d4ed8; text-align: center;">${title}</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #333;">${greeting}</p>
          <p style="font-size: 16px; line-height: 1.6; color: #333;">${message}</p>
          <p style="font-size: 14px; color: #999; margin-top: 30px; text-align: center;">
            ${thanks}
          </p>
        </div>
      </div>
    `;

    await this.mailerService.sendMail({
      to,
      subject,
      html: htmlContent,
      attachments: [
        {
          filename: 'factureCarSale.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  async sendInvoiceWithPdf(to: string, subject: string, context: Context, lang: string = 'fr') {
    const { order, user, subOrders } = context;

    const subOrdersHtml =
      context.subOrdersHtml ?? (await this.generateSubOrdersHtml(subOrders, order.currency, lang));

    const pdfBuffer = await this.generatePdfFromTemplate('invoice.ejs', {
      ...context,
      subOrdersHtml,
    });

    const logoUrl = 'https://api-prod.favorhelp.com/uploads/1%20Favor.webp';
    const invoiceDate = order.createdAt
      ? new Date(order.createdAt).toLocaleDateString(lang)
      : new Date().toLocaleDateString(lang);

    const paymentStatusRaw = (order.paymentStatus || 'PENDING').toLowerCase().trim();
    let statusTextKey = '';
    let statusClass = '';
    let statusIcon = '';
    if (paymentStatusRaw === 'paid') {
      statusTextKey = 'order.email.status_paid';
      statusClass = 'paid';
      statusIcon = 'check-circle';
    } else if (paymentStatusRaw === 'pending') {
      statusTextKey = 'order.email.status_pending';
      statusClass = 'pending';
      statusIcon = 'hourglass-half';
    } else {
      statusTextKey = 'order.email.status_rejected';
      statusClass = 'cancelled';
      statusIcon = 'times-circle';
    }
    const statusText = await this.i18n.translate(statusTextKey, lang);

    const shippingCost = Number(order.shippingCost) || 0;
    const subtotal = Number(order.totalAmount) || 0;
    const total = subtotal + shippingCost;
    const formattedTotal = total.toFixed(2);

    // Traductions pour le HTML
    const t = {
      invoice: await this.i18n.translate('order.email.invoice_title', lang),
      orderTitle: await this.i18n.translate('order.email.order', lang),
      ref: await this.i18n.translate('order.email.reference', lang),
      date: await this.i18n.translate('order.email.date', lang),
      billed_to: await this.i18n.translate('order.email.billed_to', lang),
      invoice_number: await this.i18n.translate('order.email.invoice_number', lang),
      delivery_address: await this.i18n.translate('order.email.delivery_address', lang),
      not_specified: await this.i18n.translate('order.email.not_specified', lang),
      details: await this.i18n.translate('order.email.details', lang),
      product: await this.i18n.translate('order.email.product', lang),
      qty: await this.i18n.translate('order.email.qty', lang),
      unit_price: await this.i18n.translate('order.email.unit_price', lang),
      total_label: await this.i18n.translate('order.email.total', lang),
      subtotal_label: await this.i18n.translate('order.email.subtotal', lang),
      shipping_label: await this.i18n.translate('order.email.delivery', lang),
      grand_total: await this.i18n.translate('order.email.total_amount', lang),
      payment_instructions: await this.i18n.translate('order.email.payment_instructions', lang),
      equity_account: await this.i18n.translate('order.email.equity_account', lang),
      mobile_money: await this.i18n.translate('order.email.mobile_money', lang),
      important: await this.i18n.translate('order.email.important', lang),
      contact_after_payment: await this.i18n.translate('order.email.contact_after_payment', lang),
      pin_label: await this.i18n.translate('order.email.pin', lang),
      pin_instruction: await this.i18n.translate('order.email.pin_instruction', lang),
      note_pdf: await this.i18n.translate('order.email.note_pdf', lang),
      contact: await this.i18n.translate('order.email.contact', lang),
      client_service: await this.i18n.translate('order.email.client_service', lang),
      phone: await this.i18n.translate('order.email.phone', lang),
      email: await this.i18n.translate('order.email.email', lang),
      website: await this.i18n.translate('order.email.website', lang),
      legal_rccm: await this.i18n.translate('order.email.legal_rccm', lang),
      legal_tax: await this.i18n.translate('order.email.legal_tax', lang),
      legal_national_id: await this.i18n.translate('order.email.legal_national_id', lang),
      legal_import_export: await this.i18n.translate('order.email.legal_import_export', lang),
      greeting_line: await this.i18n.translate('order.email.greeting', lang, { name: user.fullName }),
      invoice_ready: await this.i18n.translate('order.email.invoice_ready', lang),
      payment_prompt: await this.i18n.translate('order.email.payment_prompt', lang),
      status_label: await this.i18n.translate('order.email.status', lang),
      pin_code_label: await this.i18n.translate('order.email.pin_code', lang),
      keep_confidential: await this.i18n.translate('order.email.keep_confidential', lang),
    };

    const htmlContent = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t.invoice} - FavorHelp</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
  <style>/* Votre CSS inchangé - conservé tel quel */</style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div class="invoice-header">
      <table class="header-table" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right: 15px;">
                  <img src="${logoUrl}" alt="FavorHelp" class="logo-img" />
                </td>
                <td>
                  <div class="company-text">
                    <h1>${t.invoice}</h1>
                    <p class="subtitle">FavorHelp • Service Client</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
          <td align="right" class="invoice-meta">
            <div class="invoice-title">${t.orderTitle}</div>
            <div class="status-badge ${statusClass}">
              <i class="fas fa-${statusIcon}"></i> ${statusText}
            </div>
            <div class="invoice-ref">
              ${t.ref}: #${order.invoiceNumber || order.id} | ${t.date}: ${invoiceDate}
            </div>
          </td>
        </tr>
      </table>
      <div class="legal-info">
        <div class="legal-item"><span class="legal-label">${t.legal_rccm}:</span> 21-A-770</div>
        <div class="legal-item"><span class="legal-label">${t.legal_tax}:</span> A2156062L</div>
        <div class="legal-item"><span class="legal-label">${t.legal_national_id}:</span> 19-G4701-N74976H</div>
        <div class="legal-item"><span class="legal-label">${t.legal_import_export}:</span> PP/0023/EWX-23/1002234MK/W</div>
      </div>
    </div>

    <div class="greeting">
      <p>${t.greeting_line}</p>
      <p>${t.invoice_ready}</p>
    </div>

    <div class="section">
      <h3 class="section-title">${t.billed_to}</h3>
      <div class="section-content">
        <table class="client-table">
          <tr>
            <td><span class="info-label">${t.billed_to}:</span> ${user.fullName}<br/>${user.email}<br/>
              ${paymentStatusRaw === 'paid' && order.pin ? `<div style="margin-top:10px;"><span class="info-label">${t.pin_code_label}</span><div style="color:#1d4ed8; font-weight:600;"><i class="fas fa-key"></i> ${order.pin}</div></div>` : ''}
            </td>
            <td><span class="info-label">${t.invoice_number}:</span> #${order.invoiceNumber || order.id}<br/>${t.date}: ${invoiceDate}<br/>${t.status_label}: ${statusText}</div></td>
            <td><span class="info-label">${t.delivery_address}:</span> ${order.addressUser?.address || t.not_specified}</div></td>
          </tr>
        </table>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">${t.details}</h3>
      <div class="section-content">
        <table class="invoice-table">
          <thead><tr><th>${t.product}</th><th>${t.qty}</th><th>${t.unit_price}</th><th class="text-right">${t.total_label}</th></tr></thead>
          <tbody>${subOrdersHtml}</tbody>
          <tfoot>
            <tr><td colspan="3" class="text-right"><strong>${t.subtotal_label}:</strong></td><td class="text-right">${subtotal} ${order.currency}</td></tr>
            ${shippingCost > 0 ? `<tr><td colspan="3" class="text-right">${t.shipping_label}:</td><td class="text-right">${shippingCost} ${order.currency}</td>` : ''}
            <tr><td colspan="3" class="text-right"><strong>${t.grand_total}:</strong></td><td class="text-right"><strong>${formattedTotal} ${order.currency}</strong></td></tr>
          </tfoot>
        </table>
      </div>
    </div>

    ${paymentStatusRaw === 'pending' ? `
    <div class="payment-box">
      <div class="payment-title"><i class="fas fa-credit-card"></i> ${t.payment_instructions}</div>
      <p style="margin:0 0 12px 0;">${t.payment_prompt}</p>
      <table class="methods-table"><tr>
        <td><div class="method"><strong>${t.equity_account}</strong><p>688200060761632</p></div></td>
        <td><div class="method"><strong>${t.mobile_money} (Airtel Money)</strong><p>+243 962 646 653</p></div></td>
      </tr></table>
      <div class="warning"><strong><i class="fas fa-exclamation-triangle"></i> ${t.important}:</strong> ${t.contact_after_payment}</div>
    </div>
    ` : ''}

    ${paymentStatusRaw === 'paid' && order.pin ? `
    <div class="pin-box">
      <div class="pin-label">${t.pin_label}</div>
      <div class="pin-code">${order.pin}</div>
      <div style="font-size:10px; color:#4b5563;">${t.pin_instruction}<br/>${t.keep_confidential}</div>
    </div>
    ` : ''}

    <div class="email-note"><p><strong>${t.note_pdf}</strong></p></div>

    <div class="section" style="border-top:1px solid #e5e7eb; padding-top:20px; margin-top:20px; border:none; background:transparent;">
      <table class="footer-table"><tr><td><div class="contact-info"><h4>${t.contact}</h4><p><strong>${t.client_service}</strong><br/>📞 ${t.phone}: +243 991 225 122<br/>✉️ ${t.email}: baenisam@gmail.com<br/>🌐 ${t.website}: www.favorhelp.com</p></div></td></tr></table>
    </div>
  </div>
</body>
</html>`;

    await this.mailerService.sendMail({
      to,
      subject,
      html: htmlContent,
      attachments: [{ filename: `facture-${order.invoiceNumber || order.id}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });
  }

  async sendReservationPdf(
    to: string,
    subject: string,
    context: {
      user: any;
      reservation: {
        id: string;
        invoiceNumber: string;
        productName: string;
        productPrice: number;
        startDate: string;
        endDate: string;
        totalPrice: number;
        adults: number;
        children: number;
        roomsBooked: number;
        status: string;
        paymentStatus?: string;
        currency?: string;
        nights?: number;
      };
    },
    lang: string = 'fr',
  ) {
    const { user, reservation } = context;

    const pdfBuffer = await this.generatePdfFromTemplate('reservation.ejs', { ...context, lang });

    const logoUrl = 'https://cosamed.org/1%20Favor.png';
    const currentDate = new Date().toLocaleDateString(lang);
    const startDate = new Date(reservation.startDate);
    const endDate = new Date(reservation.endDate);
    const nights = reservation.nights ?? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const formattedStartDate = startDate.toLocaleDateString(lang);
    const formattedEndDate = endDate.toLocaleDateString(lang);

    const status = reservation.status?.toLowerCase() || 'pending';
    const isConfirmed = status === 'confirmed' || status === 'paid';
    const isPending = status === 'pending';
    const statusTextKey = isConfirmed ? 'reservation.email.status_confirmed' : (isPending ? 'reservation.email.status_pending' : 'reservation.email.status_cancelled');
    const statusText = await this.i18n.translate(statusTextKey, lang);
    const statusClass = isConfirmed ? 'paid' : (isPending ? 'pending' : 'cancelled');
    const statusIcon = isConfirmed ? 'check-circle' : (isPending ? 'hourglass-half' : 'times-circle');
    const currency = reservation.currency || 'USD';

    const t = {
      invoice_title: await this.i18n.translate('reservation.email.invoice_title', lang),
      confirmation: await this.i18n.translate('reservation.email.confirmation', lang),
      ref: await this.i18n.translate('reservation.email.reference', lang),
      date: await this.i18n.translate('reservation.email.date', lang),
      customer_info: await this.i18n.translate('reservation.sheet.customer_info', lang),
      client: await this.i18n.translate('reservation.sheet.client', lang),
      address: await this.i18n.translate('reservation.sheet.address', lang),
      invoice: await this.i18n.translate('reservation.sheet.invoice', lang),
      reservation_details: await this.i18n.translate('reservation.sheet.reservation_details', lang),
      room: await this.i18n.translate('reservation.sheet.room', lang),
      arrival: await this.i18n.translate('reservation.sheet.arrival', lang),
      departure: await this.i18n.translate('reservation.sheet.departure', lang),
      nights_label: await this.i18n.translate('reservation.sheet.nights', lang),
      adults: await this.i18n.translate('reservation.sheet.adults', lang),
      children: await this.i18n.translate('reservation.sheet.children', lang),
      rooms: await this.i18n.translate('reservation.sheet.rooms', lang),
      financial_details: await this.i18n.translate('reservation.sheet.financial_details', lang),
      description: await this.i18n.translate('reservation.sheet.description', lang),
      price_per_night: await this.i18n.translate('reservation.sheet.price_per_night', lang),
      total_to_pay: await this.i18n.translate('reservation.sheet.total_to_pay', lang),
      payment_instructions: await this.i18n.translate('reservation.sheet.payment_instructions', lang),
      mobile_money: await this.i18n.translate('reservation.sheet.mobile_money', lang),
      bank: await this.i18n.translate('reservation.sheet.bank', lang),
      account: await this.i18n.translate('reservation.sheet.account', lang),
      contact_after_payment: await this.i18n.translate('reservation.sheet.contact_after_payment', lang),
      confirmation_message: await this.i18n.translate('reservation.sheet.confirmation_message', lang),
      hotel_contact: await this.i18n.translate('reservation.sheet.hotel_contact', lang),
      note_pdf: await this.i18n.translate('reservation.sheet.note_pdf', lang),
      contact: await this.i18n.translate('reservation.sheet.contact', lang),
      phone: await this.i18n.translate('reservation.sheet.phone', lang),
      email: await this.i18n.translate('reservation.sheet.email', lang),
      website: await this.i18n.translate('reservation.sheet.website', lang),
      terms: await this.i18n.translate('reservation.sheet.terms', lang),
      greeting_line: await this.i18n.translate('reservation.email.greeting', lang, { name: user.fullName }),
      reservation_created: await this.i18n.translate('reservation.email.reservation_created', lang),
      payment_prompt: await this.i18n.translate('reservation.email.payment_prompt', lang),
      name_display: await this.i18n.translate('reservation.email.name_display', lang),
      confirmation_body: await this.i18n.translate('reservation.email.confirmation_body', lang),
      total_label: await this.i18n.translate('reservation.sheet.total', lang),         // ajout
      status_label: await this.i18n.translate('reservation.sheet.status', lang),       // ajout
      important: await this.i18n.translate('order.email.important', lang),             // ajout (réutilisé)
    };

    const htmlContent = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <title>${t.invoice_title} - FavorHelp</title>
  <style>/* Votre CSS inchangé */</style>
</head>
<body>
  <div class="invoice-container">
    <div class="invoice-header">
      <div class="company-text">
        <h1>${t.invoice_title}</h1>
        <p class="subtitle">FavorHelp • Hôtel & Réservation</p>
      </div>
      <div class="invoice-meta">
        <div class="invoice-title">${t.confirmation}</div>
        <div class="status-badge ${statusClass}"><i class="fas fa-${statusIcon}"></i> ${statusText}</div>
        <div class="invoice-ref">${t.ref}: #${reservation.invoiceNumber} | ${t.date}: ${currentDate}</div>
      </div>
    </div>

    <div class="legal-info">
      <div class="legal-item"><span class="legal-label">RCCM:</span> 21-A-770</div>
      <div class="legal-item"><span class="legal-label">N° IMPÔT:</span> A2156062L</div>
      <div class="legal-item"><span class="legal-label">NATIONAL ID:</span> 19-G4701-N74976H</div>
      <div class="legal-item"><span class="legal-label">IMPORT/EXPORT:</span> PP/0023/EWX-23/1002234MK/W</div>
    </div>

    <div class="greeting"><p>${t.greeting_line}</p><p>${t.reservation_created}</p></div>

    <div class="section"><h3 class="section-title">${t.customer_info}</h3>
      <div class="section-content"><table class="client-table"><tr>
      <td><span class="info-label">${t.client}:</span> ${user.fullName}<br/>${user.email}<br/>${user.phone || ''}</td>
      <td><span class="info-label">${t.address}:</span> ${user.city || ''} ${user.country || ''}</td>
      <td><span class="info-label">${t.invoice}:</span> #${reservation.invoiceNumber}<br/>${t.status_label}: ${statusText}</td>
    </tr></div></div>

    <div class="section"><h3 class="section-title">${t.reservation_details}</h3>
      <div class="section-content"><table class="details-table"><tr>
        <td><span class="detail-label">${t.room}:</span> ${reservation.productName}</td>
        <td><span class="detail-label">${t.arrival}:</span> ${formattedStartDate}</td>
        <td><span class="detail-label">${t.departure}:</span> ${formattedEndDate}</td>
        <td><span class="detail-label">${t.nights_label}:</span> ${nights}</td>
      </tr>
      <tr>
        <td><span class="detail-label">${t.adults}:</span> ${reservation.adults}</td>
        <td><span class="detail-label">${t.children}:</span> ${reservation.children || 0}</td>
        <td><span class="detail-label">${t.rooms}:</span> ${reservation.roomsBooked}</td>
        <td><span class="detail-label">${t.status_label}:</span> ${statusText}</td>
      </tr></div></div>

    <div class="section"><h3 class="section-title">${t.financial_details}</h3>
      <div class="section-content"><table class="invoice-table"><thead><tr>
      <th>${t.description}</th><th>${t.rooms}</th><th>${t.nights_label}</th><th>${t.price_per_night}</th><th class="text-right">${t.total_label}</th></tr></thead>
      <tbody><tr><td>${reservation.productName}</td><td>${reservation.roomsBooked}</td><td>${nights}</td><td>${reservation.productPrice} ${currency}</td><td class="text-right">${reservation.totalPrice} ${currency}</td></tr></tbody>
      <tfoot><tr><td colspan="4" class="text-right"><strong>${t.total_to_pay}</strong></td><td class="text-right"><strong>${reservation.totalPrice} ${currency}</strong></td></tr></tfoot>
      </table></div></div>

    ${isPending ? `
    <div class="payment-box"><div class="payment-title"><i class="fas fa-credit-card"></i> ${t.payment_instructions}</div>
      <p>${t.payment_prompt}</p><table class="method-table"><tr>
      <td><div class="method"><strong>${t.mobile_money}</strong><p>+243 962 646 653<br/><small>${t.name_display}</small></p></div></td>
      <td><div class="method"><strong>${t.bank}</strong><p>Equity Bank<br/><small>${t.account}: 688200060761632</small></p></div></td>
    </table>
      <div class="warning">⚠️ <strong>${t.important}:</strong> ${t.contact_after_payment}</div>
    </div>
    ` : ''}

    ${isConfirmed ? `
    <div class="confirmation-box"><div class="confirmation-title"><i class="fas fa-check-circle"></i> ${t.confirmation_message}</div>
      <p>${t.confirmation_body}</p><div class="method"><strong>${t.hotel_contact}</strong><p>📞 +243 991 225 122<br/>✉️ baenisam@gmail.com</p></div>
    </div>
    ` : ''}

    <div class="email-note"><p><strong>${t.note_pdf}</strong></p></div>

    <div class="footer-section"><div class="contact-info"><h4>${t.contact}</h4><p>📞 ${t.phone}: +243 991 225 122<br/>✉️ ${t.email}: baenisam@gmail.com<br/>🌐 ${t.website}: www.favorhelp.com</p></div></div>
  </div>
</body>
</html>`;

    await this.mailerService.sendMail({
      to,
      subject,
      html: htmlContent,
      attachments: [{ filename: `reservation-${reservation.invoiceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });
  }

  async sendShipmentPdf(
    to: string,
    subject: string,
    context: {
      user: any;
      shipment: any;
    },
    lang: string = 'fr',
  ) {
    const { user, shipment } = context;

    const statusMap: Record<string, { key: string; icon: string; badgeClass: string }> = {
      PENDING: { key: 'shipment.status.pending', icon: 'hourglass-half', badgeClass: 'status-pending' },
      IN_TRANSIT: { key: 'shipment.status.in_transit', icon: 'shipping-fast', badgeClass: 'status-in-transit' },
      DELIVERED: { key: 'shipment.status.delivered', icon: 'check-circle', badgeClass: 'status-delivered' },
    };
    const defaultStatus = { key: 'shipment.status.cancelled', icon: 'times-circle', badgeClass: 'status-cancelled' };
    const statusInfo = statusMap[shipment.status] || defaultStatus;
    const statusText = await this.i18n.translate(statusInfo.key, lang);
    const currentDate = new Date().toLocaleDateString(lang);
    const logoUrl = 'https://cosamed.org/1%20Favor.png';

    const t = {
      confirmation_title: await this.i18n.translate('shipment.email.confirmation_title', lang),
      waybill: await this.i18n.translate('shipment.email.waybill', lang),
      ref: await this.i18n.translate('shipment.email.reference', lang),
      date: await this.i18n.translate('shipment.email.date', lang),
      customer_info: await this.i18n.translate('shipment.email.customer_info', lang),
      client: await this.i18n.translate('shipment.email.client', lang),
      address: await this.i18n.translate('shipment.email.address', lang),
      invoice: await this.i18n.translate('shipment.email.invoice', lang),
      package_details: await this.i18n.translate('shipment.email.package_details', lang),
      description: await this.i18n.translate('shipment.email.description', lang),
      quantity: await this.i18n.translate('shipment.email.quantity', lang),
      weight: await this.i18n.translate('shipment.email.weight', lang),
      value: await this.i18n.translate('shipment.email.value', lang),
      fragile: await this.i18n.translate('shipment.email.fragile', lang),
      dimensions: await this.i18n.translate('shipment.email.dimensions', lang),
      pickup_service: await this.i18n.translate('shipment.email.pickup_service', lang),
      from: await this.i18n.translate('shipment.email.from', lang),
      to: await this.i18n.translate('shipment.email.to', lang),
      contact: await this.i18n.translate('shipment.email.contact', lang),
      phone_label: await this.i18n.translate('shipment.email.phone', lang),
      shipping_service: await this.i18n.translate('shipment.email.shipping_service', lang),
      delivery_address: await this.i18n.translate('shipment.email.delivery_address', lang),
      note_pdf: await this.i18n.translate('shipment.email.note_pdf', lang),
      footer_contact: await this.i18n.translate('shipment.email.footer_contact', lang),
      instructions: await this.i18n.translate('shipment.email.instructions', lang),
      keep_document: await this.i18n.translate('shipment.email.keep_document', lang),
      present_on_pickup: await this.i18n.translate('shipment.email.present_on_pickup', lang),
      contact_for_changes: await this.i18n.translate('shipment.email.contact_for_changes', lang),
      official_document: await this.i18n.translate('shipment.email.official_document', lang),
      valid_until_delivery: await this.i18n.translate('shipment.email.valid_until_delivery', lang),
      thank_you: await this.i18n.translate('shipment.email.thank_you', lang),
      email: await this.i18n.translate('shipment.email.email', lang),
      website: await this.i18n.translate('shipment.email.website', lang),
      greeting_line: await this.i18n.translate('shipment.email.greeting', lang, { name: user.fullName }),
      shipment_created: await this.i18n.translate('shipment.email.shipment_created', lang),
      tracking_number_label: await this.i18n.translate('shipment.email.tracking_number', lang),
      status_label: await this.i18n.translate('shipment.email.status', lang),
      yes: await this.i18n.translate('common.yes', lang),
      no: await this.i18n.translate('common.no', lang),
      not_specified: await this.i18n.translate('common.not_specified', lang),
    };

    const pdfBuffer = await this.generatePdfFromTemplate('shipment.ejs', { user, shipment, lang });
    const htmlContent = `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8" /><title>${t.confirmation_title} - FavorHelp</title>
<style>/* Votre CSS inchangé */</style></head>
<body>
<div class="container">
  <div class="header"><div class="company-text"><h1>${t.confirmation_title}</h1><p class="subtitle">FavorHelp • Service de Livraison</p></div>
    <div class="shipment-meta"><div class="shipment-title">${t.waybill}</div>
    <div class="tracking-number"><i class="fas fa-barcode"></i> ${shipment.trackingNumber}</div>
    <div class="status-badge ${statusInfo.badgeClass}"><i class="${statusInfo.icon}"></i> ${statusText}</div>
    <div class="shipment-ref">${t.date}: ${currentDate}</div></div>
  </div>
  <div class="legal-info"><div><span class="legal-label">RCCM:</span> 21-A-770</div><div><span class="legal-label">N° IMPÔT:</span> A2156062L</div>
    <div><span class="legal-label">NATIONAL ID:</span> 19-G4701-N74976H</div><div><span class="legal-label">IMPORT/EXPORT:</span> PP/0023/EWX-23/1002234MK/W</div></div>

  <div class="greeting"><p>${t.greeting_line}</p><p>${t.shipment_created}</p></div>

  <div class="section"><h3 class="section-title">${t.customer_info}</h3><div class="section-content"><table>
    <td><span class="info-label">${t.client}:</span> ${user.fullName}<br/>${user.email}<br/>${user.phone || ''}</td>
    <td><span class="info-label">${t.address}:</span> ${user.city || ''} ${user.country || ''}</td>
    <td><span class="info-label">${t.invoice}:</span> #SHIP-${shipment.id}<br/>${t.status_label}: ${statusText}</td>
  </table></div></div>

  <div class="section"><h3 class="section-title">${t.package_details}</h3><div class="section-content"><tr>
    <tr><td><span class="detail-label">${t.description}:</span> ${shipment.package.description}</td><td><span class="detail-label">${t.quantity}:</span> ${shipment.package.external_quantity}</td></tr>
    ${shipment.package.weight ? `<tr><td><span class="detail-label">${t.weight}:</span> ${shipment.package.weight} kg</td>${shipment.package.value ? `<td><span class="detail-label">${t.value}:</span> ${shipment.package.value}</td>` : '<td></td>'}</tr>` : ''}
    ${!shipment.package.weight && shipment.package.value ? `<tr><td><span class="detail-label">${t.value}:</span> ${shipment.package.value}</td><td></td><tr>` : ''}
    <tr><td><span class="detail-label">${t.fragile}:</span> ${shipment.package.fragile ? t.yes : t.no}</td>${shipment.package.dimensions ? `<td><span class="detail-label">${t.dimensions}:</span> ${shipment.package.dimensions}</td>` : '<td></td>'}</tr>
  </table></div></div>

  ${shipment.pickupEnabled ? `<div class="section"><h3 class="section-title">${t.pickup_service}</h3><div class="section-content"><div><span class="service-icon"><i class="fas fa-box-open"></i></span><h4 class="service-title">Ramassage</h4></div>
    <table><td><span class="detail-label">${t.from}:</span> ${shipment.pickupFrom}</td><td><span class="detail-label">${t.to}:</span> ${shipment.pickupTo}</td></tr>
    <tr><td><span class="detail-label">${t.contact}:</span> ${shipment.pickupContactName}</td><td><span class="detail-label">${t.phone_label}:</span> ${shipment.pickupContactPhone}</td></tr></div></div>` : ''}
  ${shipment.shippingEnabled ? `<div class="section"><h3 class="section-title">${t.shipping_service}</h3><div class="section-content"><div><span class="service-icon"><i class="fas fa-truck"></i></span><h4 class="service-title">Transport</h4></div>
    <td><td><span class="detail-label">${t.from}:</span> ${shipment.shippingFrom}</td><td><span class="detail-label">${t.to}:</span> ${shipment.shippingTo}</td></tr></div></div>` : ''}
  ${shipment.deliveryEnabled ? `<div class="section"><h3 class="section-title">${t.delivery_address}</h3><div class="section-content"><tr>
    <tr><td><span class="detail-label">${t.address}:</span> ${shipment.deliveryFrom || t.not_specified}</td><td><span class="detail-label">${t.contact}:</span> ${shipment.deliveryContactName}</td></tr>
    <tr><td colspan="2"><span class="detail-label">${t.phone_label}:</span> ${shipment.deliveryContactPhone}</td></tr></div></div>` : ''}

  <div class="email-note"><p><strong>${t.note_pdf}</strong></p></div>

  <div class="footer-section"><div><h4>${t.footer_contact}</h4><p><strong>FavorHelp Livraison</strong><br/>📞 +243 991 225 122<br/>✉️ ${t.email}: baenisam@gmail.com<br/>🌐 ${t.website}: www.favorhelp.com</p></div>
    <div><h4>${t.instructions}</h4><p>• ${t.keep_document}<br/>• ${t.present_on_pickup}<br/>• ${t.contact_for_changes}</p></div>
    <div><h4>${t.note_pdf}</h4><p>${t.official_document}<br/>${t.valid_until_delivery}<br/>${t.thank_you}</p></div></div>
</div>
</body>
</html>`;

    await this.mailerService.sendMail({
      to,
      subject,
      html: htmlContent,
      attachments: [{ filename: `colis-${shipment.trackingNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });
  }

  async sendInvoicePaidWithPdf(to: string, subject: string, context: Context, lang: string = 'fr') {
    const pdfBuffer = await this.generatePdfFromTemplate('invoice.ejs', {
      ...context,
      subOrdersHtml: context.subOrdersHtml ?? (await this.generateSubOrdersHtml(context.subOrders, context.order.currency, lang)),
    });
    await this.mailerService.sendMail({
      to,
      subject,
      attachments: [{ filename: 'facture.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
    });
  }

  async sendHtmlEmailValidation(
    to: string,
    subject: string,
    htmlPageName: string,
    context: Record<string, any>,
    lang: string = 'fr',
  ) {
    const basePath =
      process.env.NODE_ENV === 'production'
        ? path.join(process.cwd(), 'dist', 'src', 'template')
        : path.join(process.cwd(), 'src', 'templates');
    const htmlPath = path.join(basePath, htmlPageName);
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    htmlContent = htmlContent.replace(/{{\s*([\w.]+)\s*}}/g, (_, match) => {
      const keys = match.split('.');
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
    await this.mailerService.sendMail({ to, subject, html: htmlContent });
  }

  async generateSubOrdersByInvoiceNumberHtml(subOrders: SubOrderEntity[], currency: string, lang: string = 'fr'): Promise<string> {
    let counter = 1;
    const productNotAvailable = await this.i18n.translate('order.product_not_available', lang);
    return subOrders
      .flatMap((subOrder) =>
        subOrder.items.map((item) => {
          const productName = item.product?.name || productNotAvailable;
          const totalPrice = item.price * item.quantity;
          return `
      <tr>
        <td>${counter++}</td>
        <td>${productName}</td>
        <td>${item.quantity}</td>
        <td>${item.price} ${currency}</td>
        <td>${totalPrice} ${currency}</td>
      </tr>
    `;
        }),
      )
      .join('');
  }

  async sendReservationInvoice(
    to: string,
    subject: string,
    context: any,
    templateName: string = 'invoice', // 'invoice' pour le billet, 'fiche' pour la fiche
    lang: string = 'fr',
  ) {
    try {
      // 1. Génération du PDF
      const templatePath = path.join(
        process.cwd(),
        process.env.NODE_ENV === 'production'
          ? `dist/src/templates/trip/${templateName}.ejs`
          : `src/templates/trip/${templateName}.ejs`,
      );
      const html = (await ejs.renderFile(templatePath, { ...context, lang })) as string;

      const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '30px', left: '20px', right: '20px' } });
      await browser.close();

      const filename = templateName === 'invoice'
        ? `billet-${context.reservation.id.slice(0, 8)}.pdf`
        : `fiche-reservation-${context.reservation.id.slice(0, 8)}.pdf`;

      const documentTypeKey = templateName === 'invoice' ? 'reservation.email.document_type_ticket' : 'reservation.email.document_type_sheet';
      const documentType = await this.i18n.translate(documentTypeKey, lang);

      const params = {
        fullName: context.user.fullName,
        ref: context.reservation.id.slice(0, 8),
        total: context.finalTotal || context.totalAmount + context.baggageFee,
        currency: context.currency,
        documentType: documentType,
      };

      let emailBody = await this.i18n.translate('reservation.email.invoice_body', lang, params);

      // 3. Fallback manuel si l'interpolation n'a pas fonctionné
      if (emailBody.includes('{fullName}') || emailBody.includes('{ref}') || emailBody.includes('{total}')) {
        console.warn('⚠️ Interpolation échouée pour reservation.email.invoice_body, remplacement manuel');
        emailBody = ""
      }

      await this.mailerService.sendMail({
        to,
        subject,
        html: emailBody,
        attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
      });
    } catch (error) {
      console.error('❌ Erreur sendReservationInvoice:', error);
      throw error;
    }
  }
}