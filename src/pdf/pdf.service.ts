// pdf.service.ts
import { Injectable } from '@nestjs/common';
import * as pdf from 'html-pdf';
import { join } from 'path';
import * as fs from 'fs';
import * as ejs from 'ejs';

@Injectable()
export class PdfService {
  async generateInvoicePdf(data: any): Promise<Buffer> {
    const templatePath = join(__dirname, '..', 'templates/order', 'invoice.html');
    const html = await ejs.renderFile(templatePath, data);

    return new Promise((resolve, reject) => {
      pdf.create(html).toBuffer((err, buffer) => {
        if (err) return reject(err);
        resolve(buffer);
      });
    });
  }
}
