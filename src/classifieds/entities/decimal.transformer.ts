import { ValueTransformer } from 'typeorm';

/** DECIMAL MySQL (chaîne) ⇄ nombre JavaScript */
export const decimalNumber: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
