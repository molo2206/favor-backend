import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { RideRealtimeService } from './ride-realtime.service';
import { DriverLocationService } from '../DriverLocation/driver-location.service';
import { RideSocketEvents } from './enum/ride-event.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { toMediaUrl } from 'src/files/media-url.util';

export type CandidateState = 'OFFERED' | 'REJECTED' | 'EXPIRED' | 'ACCEPTED' | 'WITHDRAWN';

interface CandidateRecord {
  candidateId: string;
  driverId: string; // interne, JAMAIS émis
  state: CandidateState;
  lat: number;
  lng: number;
  heading: number | null;
  distanceKm: number;
  etaMin: number | null;
  categoryId: string | null;
  /** ✅ Avatar du chauffeur (URL complète de users.image) — anonyme : aucune autre donnée perso */
  image: string | null;
  wave: number;
  order: number;
  updatedAt: string;
}

/**
 * ✅ Suivi en direct de la RECHERCHE (passager).
 *  - ride:search-candidate : chaque chauffeur sollicité et ses changements d'état, ANONYME
 *    (candidateId = hash(rideId+driverId), jamais le driverId ; position arrondie ~100 m).
 *  - ride:nearby-drivers / REST : chauffeurs proches, anonymes.
 *  État en mémoire (comme le reste du dispatch) ; nettoyé à l'acceptation / fin de course.
 */
@Injectable()
export class RideSearchTrackingService {
  private readonly logger = new Logger(RideSearchTrackingService.name);
  private readonly store = new Map<string, Map<string, CandidateRecord>>(); // rideId → candidateId → record
  private readonly byDriver = new Map<string, Map<string, string>>(); // rideId → driverId → candidateId
  private readonly orderCounter = new Map<string, number>();
  private readonly nearbyCache = new Map<string, { at: number; data: any[] }>();
  private readonly rate = new Map<string, { count: number; reset: number }>();

  constructor(
    private readonly realtime: RideRealtimeService,
    private readonly driverLocation: DriverLocationService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  /** Récupère les avatars (URL complète) de plusieurs chauffeurs en une requête. */
  private async fetchAvatars(driverIds: string[]): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    const ids = [...new Set(driverIds.filter(Boolean))];
    if (!ids.length) return map;
    try {
      const rows = await this.userRepo.find({ where: { id: In(ids) }, select: ['id', 'image'] });
      for (const u of rows) map.set(u.id, u.image ? toMediaUrl(u.image) : null);
    } catch (e: any) {
      this.logger.warn(`fetchAvatars: ${e?.message}`);
    }
    return map;
  }

  private num(key: string, def: number): number {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v > 0 ? v : def;
  }
  private get avgSpeed() {
    return this.num('RIDE_AVG_SPEED_KMH', 25);
  }
  private get roadFactor() {
    return this.num('RIDE_ROAD_FACTOR', 1.3);
  }
  private get staleSeconds() {
    return this.num('RIDE_STALE_SECONDS', 30);
  }

  private etaMinutes(km: number): number {
    return Math.max(1, Math.round((km / this.avgSpeed) * 60 * this.roadFactor));
  }
  /** Arrondi ~100 m (3 décimales ≈ 111 m) */
  private round100(n: number): number {
    return Math.round(n * 1000) / 1000;
  }
  candidateId(rideId: string, driverId: string): string {
    return 'c_' + crypto.createHash('sha256').update(`${rideId}:${driverId}`).digest('hex').slice(0, 12);
  }

  private anon(r: CandidateRecord) {
    return {
      candidateId: r.candidateId,
      state: r.state,
      lat: r.lat,
      lng: r.lng,
      heading: r.heading,
      distanceKm: r.distanceKm,
      etaMin: r.etaMin,
      categoryId: r.categoryId,
      image: r.image, // ✅ avatar du chauffeur (URL complète)
      wave: r.wave,
      order: r.order,
      timestamp: r.updatedAt,
    };
  }

  /** Offres d'une vague : enregistre et émet OFFERED, dans l'ordre réel de sollicitation. */
  async onOffered(
    ride: { id: string; riderId: string; categoryId?: string | null },
    candidates: Array<{ driverId: string; lat: number; lng: number; distanceKm: number; categoryId?: string | null }>,
    wave: number,
  ): Promise<void> {
    try {
      let rideStore = this.store.get(ride.id);
      if (!rideStore) {
        rideStore = new Map();
        this.store.set(ride.id, rideStore);
      }
      let driverMap = this.byDriver.get(ride.id);
      if (!driverMap) {
        driverMap = new Map();
        this.byDriver.set(ride.id, driverMap);
      }

      // ✅ Avatars des nouveaux candidats (ceux pas encore sollicités), en une requête
      const newDriverIds = candidates.map((c) => c.driverId).filter((id) => !driverMap!.has(id));
      const avatars = await this.fetchAvatars(newDriverIds);

      for (const c of candidates) {
        if (driverMap.has(c.driverId)) continue; // déjà sollicité (vague précédente)
        const order = (this.orderCounter.get(ride.id) ?? 0) + 1;
        this.orderCounter.set(ride.id, order);
        const cid = this.candidateId(ride.id, c.driverId);
        const rec: CandidateRecord = {
          candidateId: cid,
          driverId: c.driverId,
          state: 'OFFERED',
          lat: this.round100(Number(c.lat)),
          lng: this.round100(Number(c.lng)),
          heading: null,
          distanceKm: Math.round(Number(c.distanceKm) * 10) / 10,
          etaMin: this.etaMinutes(Number(c.distanceKm)),
          categoryId: (c.categoryId ?? ride.categoryId) ?? null,
          image: avatars.get(c.driverId) ?? null,
          wave,
          order,
          updatedAt: new Date().toISOString(),
        };
        rideStore.set(cid, rec);
        driverMap.set(c.driverId, cid);
        this.realtime.emitToUsers([ride.riderId], RideSocketEvents.SEARCH_CANDIDATE, { rideId: ride.id, ...this.anon(rec) });
      }
    } catch (e: any) {
      this.logger.warn(`onOffered: ${e?.message}`);
    }
  }

  /** Changement d'état d'un candidat (par driverId). */
  onState(rideId: string, riderId: string, driverId: string, state: CandidateState): void {
    try {
      const cid = this.byDriver.get(rideId)?.get(driverId);
      if (!cid) return;
      const rec = this.store.get(rideId)?.get(cid);
      if (!rec) return;
      rec.state = state;
      rec.updatedAt = new Date().toISOString();
      this.realtime.emitToUsers([riderId], RideSocketEvents.SEARCH_CANDIDATE, { rideId, ...this.anon(rec) });
    } catch (e: any) {
      this.logger.warn(`onState: ${e?.message}`);
    }
  }

  /** Candidats connus d'une course (pour ride:state à la reconnexion). */
  getCandidates(rideId: string) {
    const rideStore = this.store.get(rideId);
    if (!rideStore) return [];
    return [...rideStore.values()].sort((a, b) => a.order - b.order).map((r) => this.anon(r));
  }

  clear(rideId: string): void {
    this.store.delete(rideId);
    this.byDriver.delete(rideId);
    this.orderCounter.delete(rideId);
  }

  /** Instantané des chauffeurs proches (passager pendant SEARCHING) — anonyme. */
  async emitNearby(ride: { id: string; riderId: string; categoryId?: string | null; pickupLocation?: { lat: any; lng: any } | null }): Promise<void> {
    try {
      const lat = Number(ride.pickupLocation?.lat);
      const lng = Number(ride.pickupLocation?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const drivers = await this.nearby(lat, lng, ride.categoryId ?? null);
      this.realtime.emitToUsers([ride.riderId], RideSocketEvents.NEARBY_DRIVERS, {
        rideId: ride.id,
        drivers,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      this.logger.warn(`emitNearby: ${e?.message}`);
    }
  }

  /** Liste anonyme des chauffeurs proches (≤ 15). */
  private async nearby(lat: number, lng: number, categoryId: string | null) {
    const found = await this.driverLocation.findDispatchCandidates({
      lat,
      lng,
      radiusKm: this.num('RIDE_NEARBY_RADIUS_KM', 5),
      categoryId: categoryId ?? undefined,
      excludeDriverIds: [],
      staleSeconds: this.staleSeconds,
      requireKyc: false,
      limit: 15,
      passengers: 1,
    });
    const top = found.slice(0, 15);
    // ✅ Avatars (URL complète) des chauffeurs proches, en une requête
    const avatars = await this.fetchAvatars(top.map((d) => String(d.driverId)));
    return top.map((d) => ({
      candidateId: 'n_' + crypto.createHash('sha256').update(String(d.driverId)).digest('hex').slice(0, 12),
      lat: this.round100(Number(d.lat)),
      lng: this.round100(Number(d.lng)),
      heading: null,
      distanceKm: Math.round(Number(d.distanceKm) * 10) / 10,
      etaMin: this.etaMinutes(Number(d.distanceKm)),
      categoryId: d.categoryId ?? null,
      image: avatars.get(String(d.driverId)) ?? null, // ✅ avatar du chauffeur
    }));
  }

  /** REST : chauffeurs proches avant la commande (cache 5 s par zone + limite par IP). */
  async nearbyPublic(lat: number, lng: number, categoryId: string | null, ip?: string) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('Coordonnées (lat, lng) invalides.');
    }
    const key = ip || 'unknown';
    const now = Date.now();
    const r = this.rate.get(key);
    if (!r || r.reset < now) {
      this.rate.set(key, { count: 1, reset: now + 60000 });
    } else {
      r.count++;
      if (r.count > this.num('RIDE_NEARBY_RATE_PER_MINUTE', 30)) {
        throw new BadRequestException('Trop de requêtes, réessayez dans un instant.');
      }
    }

    const zone = `${Math.round(lat * 1000)}:${Math.round(lng * 1000)}:${categoryId || 'ANY'}`;
    const hit = this.nearbyCache.get(zone);
    if (hit && now - hit.at < 5000) return { drivers: hit.data, cached: true };

    const drivers = await this.nearby(lat, lng, categoryId);
    this.nearbyCache.set(zone, { at: now, data: drivers });
    if (this.nearbyCache.size > 500) this.nearbyCache.clear();
    return { drivers, cached: false };
  }
}
