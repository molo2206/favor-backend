import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import * as fs from 'fs';
import * as path from 'path';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';

interface Context {
    user: { fullName: string; email: string };
    order: { id: string; totalAmount: number; currency: string };
    subOrders: SubOrderEntity[];
    subOrdersHtml?: string;  // HTML des sous-commandes
}

@Injectable()
export class MailOrderService {
    constructor(private readonly mailerService: MailerService) { }

    generateSubOrdersHtml(subOrders: SubOrderEntity[], currency: string): string {
        const itemsHtml = subOrders.flatMap((subOrder) =>
            subOrder.items.map((item) => {
                const productName = item.product?.name || 'Produit non disponible';
                const productPrice = item.product?.price || 0;
                const totalPrice = productPrice * item.quantity;

                return `
                    <tr>
                        <td>${productName}</td>
                        <td>${item.quantity}</td>
                        <td>${productPrice} ${currency}</td>
                        <td>${totalPrice} ${currency}</td>
                    </tr>
                `;
            })
        ).join('');

        return itemsHtml;
    }

    async sendHtmlEmail(
        to: string,
        subject: string,
        htmlPageName: string,
        context: Context
    ) {
        const basePath =
            process.env.NODE_ENV === 'production'
                ? path.join(process.cwd(), 'dist', 'src', 'templates/order')
                : path.join(process.cwd(), 'src', 'templates/order');

        const htmlPath = path.join(basePath, htmlPageName);

        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // Injecter le HTML des sous-commandes dans le contexte
        if (context.subOrders && context.order?.currency) {
            context.subOrdersHtml = this.generateSubOrdersHtml(
                context.subOrders,
                context.order.currency
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
                    value = '';  // Retourner une chaîne vide si la clé est introuvable
                    break;
                }
            }
            return typeof value === 'string' ? value : String(value);
        });

        // Envoi de l'email
        await this.mailerService.sendMail({
            to,
            subject,
            html: htmlContent,
        });
    }

    async sendHtmlEmailValidation(
        to: string,
        subject: string,
        htmlPageName: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context: Record<string, any>,
    ) {
        const basePath =
            process.env.NODE_ENV === 'production'
                ? path.join(process.cwd(), 'dist', 'src', 'template/order')
                : path.join(process.cwd(), 'src', 'templates/order');

        const htmlPath = path.join(basePath, htmlPageName);  // 'order-validation' template

        let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // Remplacer les variables dans le template
        htmlContent = htmlContent.replace(/{{\s*([\w.]+)\s*}}/g, (_, match) => {
            const keys = match.split('.');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let value: any = context;
            for (const key of keys) {
                if (value && typeof value === 'object' && key in value) {
                    value = value[key];
                } else {
                    value = '';  // Retourner une chaîne vide si la clé est introuvable
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

}
