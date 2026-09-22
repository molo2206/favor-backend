// invoice.util.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class InvoiceService {
  /**
   * Génère un numéro de facture de 8 chiffres
   * Format: YYMMDDNN (8 chiffres)
   */
  generateInvoiceNumber(): string {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    const random = ('0' + Math.floor(Math.random() * 100)).slice(-2);
    
    return `${year}${month}${day}${random}`;
  }
}