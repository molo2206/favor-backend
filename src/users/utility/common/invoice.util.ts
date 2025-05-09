import { Injectable } from "@nestjs/common";

@Injectable()
export class InvoiceService {
  generateInvoiceNumber(subOrderId: string) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    return `INV-${year}${month}${day}-${subOrderId}`;
  }
}
