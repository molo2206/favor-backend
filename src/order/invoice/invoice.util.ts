import { Injectable } from '@nestjs/common';

@Injectable()
export class InvoiceService {
  generateInvoiceNumber(): string {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    const hours = ('0' + date.getHours()).slice(-2);
    const minutes = ('0' + date.getMinutes()).slice(-2);
    const seconds = ('0' + date.getSeconds()).slice(-2);
    const random = Math.floor(100 + Math.random() * 900);

    return `FAVOR-${year}${month}${day}${hours}${minutes}${seconds}${random}`;
  }
}
