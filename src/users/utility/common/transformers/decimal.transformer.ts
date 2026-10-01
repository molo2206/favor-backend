import { ValueTransformer } from 'typeorm';

export class DecimalTransformer {
  to(data: number | string): number {
    if (typeof data === 'string') {
      // Nettoyer et convertir
      data = parseFloat(data.replace(/[^0-9.]/g, ''));
    }
    return typeof data === 'number' && !isNaN(data) ? data : 0;
  }

  from(data: string): number {
    return parseFloat(data);
  }
}
