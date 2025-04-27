import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MailService {
    constructor(private readonly mailerService: MailerService) { }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async sendHtmlEmail(to: string, subject: string, htmlPageName: string, context: any = {}) {
        const basePath = process.env.NODE_ENV === 'production'
            ? path.join(process.cwd(), 'dist', 'src', 'templates')
            : path.join(process.cwd(), 'src', 'templates');

        const htmlPath = path.join(basePath, htmlPageName);
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // Ici on remplace dynamiquement les variables {{ variable }}
        for (const key in context) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            htmlContent = htmlContent.replace(regex, context[key]);
        }

        await this.mailerService.sendMail({
            to,
            subject,
            html: htmlContent,
        });
    }

}
