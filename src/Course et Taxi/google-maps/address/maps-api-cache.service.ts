import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { MapsApiCache } from './entity/maps-api-cache.entity';

/** Durée de validité (jours) par type de requête — surchargeable : MAPS_CACHE_DAYS_<KIND> (ex. MAPS_CACHE_DAYS_AUTOCOMPLETE=60) */
const DEFAULT_DAYS: Record<string, number> = {
  autocomplete: 30,
  searchPlaces: 30,
  nearbyPlaces: 7,
  place: 30,
  geocode: 90,
  ipgeo: 7,
  distance: 30,
  directions: 30,
};

/** Réponse « aucun résultat » : gardée moins longtemps, pour voir apparaître les nouveaux lieux (MAPS_CACHE_DAYS_ZERO_RESULTS) */
const ZERO_RESULTS_DAYS = 1;

export interface MapsCacheEntry<T = any> {
  data: T;
  fresh: boolean;
}

/**
 * ✅ Cache en base des réponses Google Maps.
 *   Base → trouvé et valide → réponse renvoyée, AUCUN appel Google.
 *   Base → absent ou expiré → Google → enregistrement (mise à jour de la même ligne, jamais de doublon).
 */
@Injectable()
export class MapsApiCacheService {
  private readonly logger = new Logger(MapsApiCacheService.name);

  constructor(
    @InjectRepository(MapsApiCache)
    private readonly repo: Repository<MapsApiCache>,
  ) { }

  /** Désactivation complète : MAPS_DB_CACHE=false (retour au fonctionnement d'avant) */
  get enabled(): boolean {
    return String(process.env.MAPS_DB_CACHE ?? 'true').toLowerCase() !== 'false';
  }

  /** URL Google → requête stable : sans clé API ni sessiontoken, paramètres triés */
  canonicalRequest(url: string): string {
    try {
      const u = new URL(url);
      u.searchParams.delete('key');
      u.searchParams.delete('sessiontoken');
      const params = Array.from(u.searchParams.entries())
        .map(([k, v]) => [k, k === 'input' || k === 'query' || k === 'address' || k === 'keyword'
          ? v.trim().replace(/\s+/g, ' ').toLowerCase()
          : v.trim()])
        .sort(([a], [b]) => a.localeCompare(b));
      return `${u.origin}${u.pathname}?${params.map(([k, v]) => `${k}=${v}`).join('&')}`;
    } catch {
      return url.replace(/([?&])key=[^&]*/g, '$1').replace(/([?&])sessiontoken=[^&]*/g, '$1');
    }
  }

  hash(kind: string, canonical: string): string {
    return createHash('sha256').update(`${kind}|${canonical}`).digest('hex');
  }

  private days(kind: string, status?: string): number {
    if (status === 'ZERO_RESULTS') {
      return Number(process.env.MAPS_CACHE_DAYS_ZERO_RESULTS) || ZERO_RESULTS_DAYS;
    }
    const env = Number(process.env[`MAPS_CACHE_DAYS_${kind.toUpperCase()}`]);
    return env > 0 ? env : DEFAULT_DAYS[kind] ?? 30;
  }

  /** Réponse en base (fresh=false si expirée — utilisable en secours si Google échoue) */
  async get<T = any>(keyHash: string): Promise<MapsCacheEntry<T> | null> {
    if (!this.enabled) return null;
    try {
      const row = await this.repo.findOne({ where: { key_hash: keyHash } });
      if (!row) return null;
      return { data: row.response as T, fresh: new Date(row.expires_at).getTime() > Date.now() };
    } catch (e: any) {
      this.logger.warn(`Lecture cache Maps impossible : ${e?.message}`);
      return null;
    }
  }

  /** +1 « appel Google évité » (sans attendre) */
  hit(keyHash: string): void {
    if (!this.enabled) return;
    this.repo
      .query('UPDATE `maps_api_cache` SET `hit_count` = `hit_count` + 1, `last_hit_at` = NOW() WHERE `key_hash` = ?', [keyHash])
      .catch((e) => this.logger.warn(`Compteur cache Maps : ${e?.message}`));
  }

  /** Enregistre / met à jour la réponse Google (INSERT … ON DUPLICATE KEY UPDATE → aucun doublon) */
  async set(kind: string, keyHash: string, canonical: string, data: any): Promise<void> {
    if (!this.enabled) return;
    const status = String(data?.status ?? 'OK').slice(0, 30);
    const expires = new Date(Date.now() + this.days(kind, status) * 86400000);
    try {
      await this.repo.query(
        'INSERT INTO `maps_api_cache` (`id`, `kind`, `key_hash`, `request`, `status`, `response`, `hit_count`, `google_calls`, `expires_at`, `created_at`, `updated_at`) ' +
        'VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, NOW(), NOW()) ' +
        'ON DUPLICATE KEY UPDATE `status` = VALUES(`status`), `response` = VALUES(`response`), `expires_at` = VALUES(`expires_at`), ' +
        '`google_calls` = `google_calls` + 1, `updated_at` = NOW()',
        [randomUUID(), kind.slice(0, 40), keyHash, canonical, status, JSON.stringify(data ?? null), expires],
      );
    } catch (e: any) {
      // Ne bloque jamais la réponse à l'utilisateur
      this.logger.warn(`Écriture cache Maps impossible (${kind}) : ${e?.message}`);
    }
  }

  /** Statistiques : appels Google faits / évités par type */
  async stats() {
    const rows = await this.repo
      .createQueryBuilder('c')
      .select('c.kind', 'kind')
      .addSelect('COUNT(*)', 'entries')
      .addSelect('SUM(c.google_calls)', 'googleCalls')
      .addSelect('SUM(c.hit_count)', 'servedFromDatabase')
      .addSelect('SUM(CASE WHEN c.expires_at > NOW() THEN 1 ELSE 0 END)', 'valid')
      .groupBy('c.kind')
      .orderBy('c.kind', 'ASC')
      .getRawMany();
    const byKind = rows.map((r) => ({
      kind: r.kind,
      entries: Number(r.entries ?? 0),
      valid: Number(r.valid ?? 0),
      googleCalls: Number(r.googleCalls ?? 0),
      servedFromDatabase: Number(r.servedFromDatabase ?? 0),
    }));
    const googleCalls = byKind.reduce((s, r) => s + r.googleCalls, 0);
    const served = byKind.reduce((s, r) => s + r.servedFromDatabase, 0);
    return {
      googleCalls,
      servedFromDatabase: served,
      savedPercent: googleCalls + served > 0 ? Math.round((served / (googleCalls + served)) * 1000) / 10 : 0,
      byKind,
    };
  }

  /**
   * Nettoyage chaque nuit : supprime les réponses expirées depuis plus de MAPS_CACHE_PURGE_DAYS jours (défaut 60).
   * Les réponses expirées plus récentes sont gardées comme secours si Google tombe en panne.
   */
  @Cron('0 47 3 * * *')
  async purgeExpired(): Promise<void> {
    if (!this.enabled) return;
    const days = Number(process.env.MAPS_CACHE_PURGE_DAYS) || 60;
    try {
      let total = 0;
      for (let i = 0; i < 50; i++) {
        const res: any = await this.repo.query(
          'DELETE FROM `maps_api_cache` WHERE `expires_at` < (NOW() - INTERVAL ? DAY) LIMIT 2000',
          [days],
        );
        const affected = Number(res?.affectedRows ?? res?.[1] ?? 0);
        total += affected;
        if (affected < 2000) break;
      }
      if (total) this.logger.log(`🧹 Cache Maps : ${total} réponse(s) expirée(s) supprimée(s)`);
    } catch (e: any) {
      this.logger.warn(`Nettoyage cache Maps impossible : ${e?.message}`);
    }
  }
}
