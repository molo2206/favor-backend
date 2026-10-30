import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { DriverWallet } from './entity/driver-wallet.entity';

const normCurrency = (c?: string | null): string | null => {
  const v = c ? String(c).trim().toUpperCase().replace(/[^A-Z]/g, '') : '';
  return v && v.length <= 10 ? v : null;
};

/**
 * ✅ Crée le portefeuille du chauffeur dans la devise de la course s'il n'existe pas encore
 * (course en USD → portefeuille USD, en CDF → portefeuille CDF…).
 * INSERT IGNORE sur l'index unique (driverId, currency) : sûr même appelé deux fois en même temps.
 * Ne bloque jamais l'appelant (erreur seulement journalisée par l'appelant s'il le souhaite).
 */
export async function ensureDriverWallet(
  m: EntityManager,
  driverId?: string | null,
  currency?: string | null,
  rideId?: string | null,
): Promise<void> {
  const cur = normCurrency(currency);
  if (!driverId || !cur) return;
  await m
    .createQueryBuilder()
    .insert()
    .into(DriverWallet)
    .values({
      id: randomUUID(),
      driverId,
      currency: cur,
      status: 'ACTIVE',
      earned: 0 as any,
      withdrawn: 0 as any,
      available: 0 as any,
      ridesCount: 0,
      firstRideId: rideId ?? null,
    })
    .orIgnore()
    .execute();
}

/** Comme ensureDriverWallet, sans jamais lever d'erreur (appel en tâche de fond) */
export function ensureDriverWalletSafe(m: EntityManager, driverId?: string | null, currency?: string | null, rideId?: string | null): void {
  void ensureDriverWallet(m, driverId, currency, rideId).catch(() => undefined);
}
