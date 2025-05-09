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
            ? path.join(process.cwd(), 'dist', 'src', 'templates/auth')
            : path.join(process.cwd(), 'src', 'templates/auth');

        const htmlPath = path.join(basePath, htmlPageName);
        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // Remplacer {{ variable }} ou {{ object.property }}
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
        });
    }
}
