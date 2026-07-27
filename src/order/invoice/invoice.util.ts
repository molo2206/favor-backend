import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from 'src/order/entities/order.entity';

@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
  ) { }

  /**
   * Génère un numéro de facture unique de 8 chiffres
   * Format: YYMMDDNN (8 chiffres)
   * Exemple: 26072801
   */
  async generateInvoiceNumber(): Promise<string> {
    let invoiceNumber: string;
    let exists: boolean;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2); // 26
      const month = ('0' + (date.getMonth() + 1)).slice(-2); // 07
      const day = ('0' + date.getDate()).slice(-2); // 28

      // Partie aléatoire : 2 chiffres (00-99)
      const random = ('0' + Math.floor(Math.random() * 100)).slice(-2);

      // Format: YYMMDDNN (8 chiffres)
      invoiceNumber = `${year}${month}${day}${random}`;

      // Vérifier si ce numéro existe déjà
      const existingOrder = await this.orderRepo.findOne({
        where: { invoiceNumber },
      });
      exists = !!existingOrder;

      attempts++;
    } while (exists && attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      // Fallback : utiliser timestamp + random
      const timestamp = Date.now().toString().slice(-4);
      const random = ('0' + Math.floor(Math.random() * 100)).slice(-2);
      invoiceNumber = `${timestamp}${random}`;
      // Ajuster à 8 caractères si nécessaire
      if (invoiceNumber.length > 8) {
        invoiceNumber = invoiceNumber.slice(0, 8);
      }
      if (invoiceNumber.length < 8) {
        invoiceNumber = invoiceNumber.padStart(8, '0');
      }
    }

    return invoiceNumber;
  }

  /**
   * Génère un numéro de facture sans vérification en base
   * (pour les cas où on ne veut pas de vérification)
   */
  generateInvoiceNumberSimple(): string {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    const random = ('0' + Math.floor(Math.random() * 100)).slice(-2);
    return `${year}${month}${day}${random}`;
  }

  /**
   * Vérifie si un numéro de facture existe déjà
   */
  async invoiceNumberExists(invoiceNumber: string): Promise<boolean> {
    const order = await this.orderRepo.findOne({
      where: { invoiceNumber },
    });
    return !!order;
  }
}