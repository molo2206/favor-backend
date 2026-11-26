import { Injectable } from '@nestjs/common';
import * as ejs from 'ejs';
import { join } from 'path';
import * as fs from 'fs/promises';
import { renderHtmlToPdf } from 'src/common/pdf/html-to-pdf';

@Injectable()
export class PdfService {
  async generatePdfFromTemplate(
    templateName: string,
    data: any,
  ): Promise<Buffer> {
    const templatePath = join(__dirname, '..', 'templates', `${templateName}.html`);
    const htmlTemplate = await fs.readFile(templatePath, 'utf8');
    const renderedHtml = ejs.render(htmlTemplate, data);

    // ✅ Chromium partagé + file d'attente (au lieu d'un Chromium lancé à chaque PDF)
    return renderHtmlToPdf(renderedHtml, {
      pdf: {
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
      },
    });
  }
}
