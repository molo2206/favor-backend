import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as ejs from 'ejs';
import { join } from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class PdfService {
  async generatePdfFromTemplate(
    templateName: string,
    data: any,
  ): Promise<Buffer> {
    const templatePath = join(__dirname, '..', 'templates', `${templateName}.html`);
    const htmlTemplate = await fs.readFile(templatePath, 'utf8');
    const renderedHtml = ejs.render(htmlTemplate, data);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    await page.setContent(renderedHtml, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });

    await browser.close();

    return pdfBuffer;
  }
}
