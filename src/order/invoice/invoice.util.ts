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

  generateInvoiceNumber(): string {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2); // 26
    const month = ('0' + (date.getMonth() + 1)).slice(-2); // 07
    const day = ('0' + date.getDate()).slice(-2); // 28
    const random = ('0' + Math.floor(Math.random() * 100)).slice(-2); // 01-99

    // Format: YYMMDDNN (8 chiffres)
    return `${year}${month}${day}${random}`;
  }

  /**
   * Vérifie si un numéro de facture existe déjà (asynchrone)
   */
  async invoiceNumberExists(invoiceNumber: string): Promise<boolean> {
    const order = await this.orderRepo.findOne({
      where: { invoiceNumber },
    });
    return !!order;
  }

  /**
   * Génère un numéro de facture unique (asynchrone avec vérification)
   */
  async generateUniqueInvoiceNumber(): Promise<string> {
    let invoiceNumber: string;
    let exists: boolean;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      invoiceNumber = this.generateInvoiceNumber();
      exists = await this.invoiceNumberExists(invoiceNumber);
      attempts++;
    } while (exists && attempts < maxAttempts);

    return invoiceNumber;
  }
}
