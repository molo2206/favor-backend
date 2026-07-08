// src/mail/interfaces/context.interface.ts
export interface Context {
  user?: any;
  order?: any;
  subOrders?: any[];
  subOrdersHtml?: string;
  year?: number;

  // ✅ Ajout pour le PIN
  pinCode?: string;
  invoiceNumber?: string;
}
