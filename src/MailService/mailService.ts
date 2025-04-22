import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as hbs from 'nodemailer-express-handlebars';
import { join } from 'path';

@Injectable()
export class MailService {
    private transporter;

    constructor(
        private readonly configService: ConfigService,
    ) {
        this.transporter = nodemailer.createTransport({
            service: this.configService.get<string>('MAILER_HOST'), // ou 'smtp.mailtrap.io', etc.
            auth: {
                user: this.configService.get<string>('MAILER_USER'),
                pass: this.configService.get<string>('MAILER_PASS'),
            },
        });

        this.transporter.use(
            'compile',
            hbs({
                viewEngine: {
                    partialsDir: join(__dirname, 'templates'),
                    defaultLayout: false,
                },
                viewPath: join(__dirname, 'templates'),
                extName: '.hbs',
            }),
        );
    }

    async sendWelcomeEmail(to: string, context: { name: string }) {
        await this.transporter.sendMail({
            from: this.configService.get<string>('ACCESS_TOKEN_SECRET_KEY'),
            to,
            subject: 'Bienvenue sur notre application !',
            template: 'welcome', // correspond à welcome.hbs
            context, // les variables à injecter dans le template
        });
    }
}
