import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import hbs from 'nodemailer-express-handlebars';

import { join } from 'path';

@Injectable()
export class MailService {
    private transporter;

    constructor(
        private readonly configService: ConfigService,
    ) {
        this.transporter = nodemailer.createTransport({
            host: this.configService.get<string>('MAILER_HOST'),
            port: this.configService.get<number>('MAILER_PORT'),
            secure: false,
            auth: {
                user: this.configService.get<string>('MAILER_USER'),
                pass: this.configService.get<string>('MAILER_PASS'),
            },
        });


        this.transporter.use(
            'compile',
            hbs({
                viewEngine: {
                    partialsDir: join(process.cwd(), 'src', 'MailService', 'templates'),
                    defaultLayout: false,
                },
                viewPath: join(process.cwd(), 'src', 'MailService', 'templates'),
                extName: '.hbs',
            }),
        );
    }

    async sendWelcomeEmail(to: string, subject: string, context: { name: string }) {
        await this.transporter.sendMail({
            from: this.configService.get<string>('ACCESS_TOKEN_SECRET_KEY'),
            to,
            subject: subject,
            template: 'createcount', // correspond à welcome.hbs
            context, // les variables à injecter dans le template
        });
    }
}
