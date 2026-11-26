import { ValueTransformer } from 'typeorm';

/** MySQL renvoie les DECIMAL en texte : on les convertit en nombre */
export const decimalNumber: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value === null || value === undefined ? null : typeof value === 'number' ? value : parseFloat(value),
};
