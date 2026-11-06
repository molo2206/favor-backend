// src/shipment/shipment-currency.ts
import { BadRequestException } from '@nestjs/common';

/** ✅ Devise d'un colis : code ISO à 3 lettres (USD par défaut) */
export const DEFAULT_SHIPMENT_CURRENCY = 'USD';
export const CURRENCY_CODE = /^[A-Z]{3}$/;

/** Normalise une devise saisie (« cdf » → « CDF ») */
export const toCurrency = ({ value }: { value: any }) =>
  typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : value;

/** Devises acceptées : SHIPMENT_CURRENCIES (ex. USD,CDF) ; vide = tout code ISO à 3 lettres */
export function allowedShipmentCurrencies(): string[] {
  return String(process.env.SHIPMENT_CURRENCIES ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

/** Vérifie et normalise ; renvoie la devise par défaut si rien n'est fourni */
export function resolveShipmentCurrency(value: string | null | undefined, fallback?: string | null, message?: string): string {
  const raw = String(value ?? '').trim().toUpperCase();
  const c = raw || String(fallback ?? '').trim().toUpperCase() || DEFAULT_SHIPMENT_CURRENCY;
  const allowed = allowedShipmentCurrencies();
  if (!CURRENCY_CODE.test(c) || (allowed.length && !allowed.includes(c))) {
    throw new BadRequestException(message || `Devise non acceptée : ${c}${allowed.length ? ` (acceptées : ${allowed.join(', ')})` : ''}`);
  }
  return c;
}

/** Montant affiché : « 25 $ » pour USD, sinon « 25 000 CDF » */
export function formatShipmentAmount(amount: number | null | undefined, currency?: string | null): string {
  const c = (currency || DEFAULT_SHIPMENT_CURRENCY).toUpperCase();
  const n = Number(amount ?? 0);
  return c === 'USD' ? `${n} $` : `${n} ${c}`;
}
