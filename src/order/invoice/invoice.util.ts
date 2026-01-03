import { Injectable } from "@nestjs/common";

@Injectable()
export class InvoiceService {
  generateInvoiceNumber(): string {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const random = Math.floor(10 + Math.random() * 90);
    return `FAVOR-${year}${month}${random}`;
  }
}  
