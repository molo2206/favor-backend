import { BadRequestException } from '@nestjs/common';

export function normalizeOptions(options: any): string[] {
  try {
    // Déjà un tableau
    if (Array.isArray(options)) {
      return options.map((o) => String(o).trim());
    }

    // Format string
    if (typeof options === 'string') {
      // CSV → "Rouge, Vert, Bleu"
      if (options.includes(',')) {
        return options.split(',').map((o) => o.trim());
      }

      // JSON string → '["Rouge","Vert"]'
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) return parsed;

      throw new Error('Invalid JSON array');
    }

    throw new Error('Invalid options format');
  } catch {
    throw new BadRequestException('Le format des options est invalide.');
  }
}
