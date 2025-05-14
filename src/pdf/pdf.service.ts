import { Injectable } from '@nestjs/common';
import { join } from 'path';
import { renderFile } from 'ejs';

@Injectable()
export class PdfService {
  // PDF Service: Générer le PDF
  async generateInvoicePdf({
    user,
    order,
    subOrders,
  }: {
    user: any;
    order: any;
    subOrders: any[];
  }): Promise<Buffer> {
    try {
      const rootDir = process.cwd(); // Racine du projet
      const templatePath = join(rootDir, 'src', 'templates', 'invoice.ejs');

      // Générer le HTML des sous-commandes
      const subOrdersHtml = this.generateSubOrdersHtml(
        subOrders,
        order.currency,
      );

      // Générer le HTML complet pour la facture en utilisant EJS
      const htmlContent = await renderFile(templatePath, {
        user,
        order,
        subOrdersHtml, // Passer le HTML des sous-commandes
      });

      // Créer et retourner le PDF à partir du HTML
      const pdfBuffer = await this.createPdfFromHtml(htmlContent);
      return pdfBuffer;
    } catch (error) {
      console.error('❌ Erreur de génération du PDF:', error);
      throw new Error('Échec de la génération du PDF de la facture.');
    }
  }

  // Méthode privée pour générer le HTML des sous-commandes
 private generateSubOrdersHtml(subOrders: any[], currency: string): string {
  let counter = 1;

  return subOrders
    .flatMap((subOrder) =>
      subOrder.items.map((item) => {
        const productName = item.product?.name || 'Produit non disponible';
        
        // Vérifier si productPrice est un nombre, sinon le définir à 0
        const productPrice = typeof item.product?.price === 'number' ? item.product?.price : 0;
        const totalPrice = productPrice * item.quantity;

        // Utilisation de .toFixed() uniquement si productPrice est un nombre valide
        return `
          <tr>
            <td>${counter++}</td>
            <td>${productName}</td>
            <td>${item.quantity}</td>
            <td>${productPrice.toFixed(2)} ${currency}</td>
            <td>${totalPrice.toFixed(2)} ${currency}</td>
          </tr>
        `;
      }),
    )
    .join('');
}

  // Méthode pour créer le PDF à partir du HTML généré
  private async createPdfFromHtml(html: string): Promise<Buffer> {
    // Ton implémentation PDF ici (ex: via une librairie comme 'puppeteer')
    return Buffer.from(''); // Remplacer avec la vraie logique de création du PDF
  }
}
