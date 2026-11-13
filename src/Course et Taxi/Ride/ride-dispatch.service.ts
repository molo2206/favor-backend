import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { In, LessThan, Repository } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { NotificationType } from 'src/notification/type/notification.type';
import { Ride } from './entity/Ride.entity';
import { RideStatus } from './enum/RideStatus.enum';
import { RideEventType, RideSocketEvents } from './enum/ride-event.enum';
import { RideRealtimeService } from './ride-realtime.service';
import { RideHistoryService } from './ride-history.service';
import { DispatchCandidate, DriverLocationService } from '../DriverLocation/driver-location.service';

/** Vague de recherche (mode smart) : rayon (km), nombre de chauffeurs, broadcast = tous les restants */
type Wave = { km: number; count: number; broadcast?: boolean };

export const SEARCHABLE_STATUSES = [RideStatus.PENDING, RideStatus.SEARCHING];

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(x))) * 100) / 100;
}

/**
 * Recherche de chauffeur.
 *
 * ✅ Mode « smart » (recommandé, RIDE_DISPATCH_MODE=smart) — professionnel :
 *  - vagues successives de rayon croissant (RIDE_DISPATCH_WAVES, ex. « 2:3,4:5,7:8,12:15 » = 3 chauffeurs à 2 km,
 *    puis 5 à 4 km, 8 à 7 km, 15 à 12 km), une nouvelle vague toutes les RIDE_WAVE_INTERVAL_SECONDS ;
 *    les offres des vagues précédentes continuent de sonner (RIDE_OFFER_TIMEOUT_SECONDS) ;
 *  - dernière vague facultative (RIDE_DISPATCH_FINAL_BROADCAST=true) : tous les chauffeurs restants
 *    jusqu'à RIDE_BROADCAST_RADIUS_KM (20 km par défaut) ;
 *  - classement des chauffeurs d'une vague : temps d'arrivée estimé (distance × RIDE_ROAD_FACTOR),
 *    note des passagers (90 jours), taux d'acceptation récent, temps d'attente sans course (équité) ;
 *  - un chauffeur ne reçoit qu'une offre à la fois (pas deux appels qui sonnent ensemble) ;
 *  - si tous les chauffeurs sollicités refusent, la vague suivante part immédiatement ;
 *  - le passager reçoit la progression (« ride:search-progress » : vague, rayon, chauffeurs sollicités, ETA du plus proche).
 *
 * Mode « broadcast » (RIDE_DISPATCH_MODE=broadcast) :
 *  - dès la recherche du client, l'offre (appel) part à TOUS les chauffeurs disponibles :
 *    en ligne, libres, catégorie de véhicule demandée, position récente, dans RIDE_BROADCAST_RADIUS_KM
 *    (0 = sans limite de distance) ;
 *  - à chaque tour suivant, les chauffeurs qui viennent de se connecter la reçoivent aussi ;
 *  - premier chauffeur qui accepte = gagnant : l'offre est retirée chez TOUS les autres
 *    (sonnerie arrêtée + offre supprimée de leurs notifications) et seul ce chauffeur reçoit
 *    ensuite les notifications de la course.
 *
 * Mode « nearest » (RIDE_DISPATCH_MODE=nearest), façon Bolt :
 *  - offre envoyée par lots aux chauffeurs les plus proches (rayon croissant à chaque tour) ;
 *  - chaque tour dure RIDE_OFFER_TIMEOUT_SECONDS ; les offres des tours précédents restent valables ;
 *  - premier chauffeur qui accepte = gagnant (verrou en base) ;
 *  - si tous refusent, tour suivant tout de suite ; après le dernier rayon : « aucun chauffeur ».
 * Les minuteries sont en mémoire ; un balayage périodique reprend les courses après un redémarrage.
 */
@Injectable()
export class RideDispatchService implements OnModuleDestroy {
  private readonly logger = new Logger(RideDispatchService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Set<string>();
  /** Offre en cours par chauffeur (un seul appel à la fois) */
  private readonly activeOffers = new Map<string, { rideId: string; until: number }>();
  /** Statistiques récentes par chauffeur (offres reçues, acceptées, refusées) — en mémoire */
  private readonly perf = new Map<string, { offers: number; accepted: number; rejected: number; at: number }>();
  private readonly countedRejects = new Set<string>();

  constructor(
    @InjectRepository(Ride) private readonly rideRepo: Repository<Ride>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    private readonly realtime: RideRealtimeService,
    private readonly history: RideHistoryService,
    private readonly driverLocation: DriverLocationService,
    private readonly config: ConfigService,
  ) { }

  // ---------------- réglages (.env) ----------------
  get radii(): number[] {
    const raw = this.config.get<string>('RIDE_DISPATCH_RADII_KM') || '3,5,8';
    const list = raw.split(',').map((x) => Number(x.trim())).filter((x) => x > 0);
    return list.length ? list : [3, 5, 8];
  }
  get batchSize(): number {
    return Math.max(1, Number(this.config.get('RIDE_DISPATCH_BATCH') || 5));
  }
  /** smart (défaut) : vagues classées ; nearest : les plus proches par lots ; broadcast : tous en même temps */
  get mode(): 'smart' | 'nearest' | 'broadcast' {
    const m = String(this.config.get('RIDE_DISPATCH_MODE') || 'smart').toLowerCase();
    return m === 'broadcast' ? 'broadcast' : m === 'nearest' ? 'nearest' : 'smart';
  }
  get broadcast(): boolean {
    return this.mode === 'broadcast';
  }
  get smart(): boolean {
    return this.mode === 'smart';
  }
  /** Vagues du mode smart */
  get waves(): Wave[] {
    const raw = this.config.get<string>('RIDE_DISPATCH_WAVES') || '2:3,4:5,7:8,12:15';
    const list: Wave[] = raw
      .split(',')
      .map((w) => w.split(':').map((x) => Number(x.trim())))
      .filter(([km, n]) => km > 0 && n > 0)
      .map(([km, n]) => ({ km, count: Math.round(n) }));
    const waves = list.length ? list : [{ km: 2, count: 3 }, { km: 4, count: 5 }, { km: 7, count: 8 }, { km: 12, count: 15 }];
    if (String(this.config.get('RIDE_DISPATCH_FINAL_BROADCAST') ?? 'true').toLowerCase() !== 'false') {
      const max = Number(this.config.get('RIDE_BROADCAST_RADIUS_KM') ?? 0);
      waves.push({ km: Number.isFinite(max) && max > 0 ? max : 20, count: 100000, broadcast: true });
    }
    return waves;
  }
  /** Délai entre deux vagues (les offres précédentes continuent de sonner) */
  get waveIntervalSec(): number {
    return Math.min(this.offerTimeoutSec, Math.max(5, Number(this.config.get('RIDE_WAVE_INTERVAL_SECONDS') || 15)));
  }
  /** Distance réelle par la route ≈ distance à vol d'oiseau × facteur */
  get roadFactor(): number {
    const v = Number(this.config.get('RIDE_ROAD_FACTOR') || 1.35);
    return Number.isFinite(v) && v >= 1 ? v : 1.35;
  }
  /** Rayon maximal de recherche (estimation « chauffeur le plus proche » avant la commande) */
  get searchRadiusKm(): number {
    if (this.smart) return Math.max(...this.waves.map((w) => w.km));
    if (this.broadcast) return Math.min(this.broadcastRadiusKm, 50);
    return this.radii[this.radii.length - 1];
  }
  private get roundsCount(): number {
    return this.smart ? this.waves.length : this.broadcast ? this.broadcastRounds : this.radii.length;
  }
  /** Distance maximale des chauffeurs sollicités en mode broadcast (km) ; 0 = sans limite */
  get broadcastRadiusKm(): number {
    const v = Number(this.config.get('RIDE_BROADCAST_RADIUS_KM') ?? 0);
    return Number.isFinite(v) && v > 0 ? v : 20000;
  }
  /** Nombre de tours (rappels) en mode broadcast : nouveaux chauffeurs connectés entre-temps */
  get broadcastRounds(): number {
    return Math.max(1, Number(this.config.get('RIDE_BROADCAST_ROUNDS') || this.radii.length));
  }
  get offerTimeoutSec(): number {
    return Math.max(5, Number(this.config.get('RIDE_OFFER_TIMEOUT_SECONDS') || 30)); // ✅ 30 s : le temps de réveiller un téléphone en veille
  }
  get staleSeconds(): number {
    return Math.max(0, Number(this.config.get('RIDE_DRIVER_STALE_SECONDS') || 900)); // ✅ 15 min : app fermée, position moins fréquente
  }
  get requireKyc(): boolean {
    return String(this.config.get('RIDE_REQUIRE_KYC') || 'false').toLowerCase() === 'true';
  }
  get avgSpeedKmh(): number {
    return Math.max(5, Number(this.config.get('RIDE_AVG_SPEED_KMH') || 25));
  }

  etaMinutes(km: number): number {
    return Math.max(1, Math.round(((km * (this.smart ? this.roadFactor : 1)) / this.avgSpeedKmh) * 60));
  }

  // ---------------- classement (mode smart) ----------------
  private perfOf(driverId: string) {
    let p = this.perf.get(driverId);
    // Statistiques « oubliées » après 7 jours
    if (!p || Date.now() - p.at > 7 * 86400000) {
      p = { offers: 0, accepted: 0, rejected: 0, at: Date.now() };
      this.perf.set(driverId, p);
    }
    return p;
  }

  /** Chauffeurs qui sonnent déjà pour une autre course */
  private busyWithOffer(rideId: string): string[] {
    const now = Date.now();
    const out: string[] = [];
    for (const [driverId, o] of this.activeOffers) {
      if (o.until <= now) this.activeOffers.delete(driverId);
      else if (o.rideId !== rideId) out.push(driverId);
    }
    return out;
  }

  /**
   * Classe les candidats (score bas = meilleur, en minutes équivalentes) :
   * ETA + (5 − note) × 1,5 + (1 − taux d'acceptation) × 4 − bonus d'attente (≤ 2 min).
   */
  private async rank(candidates: DispatchCandidate[]): Promise<(DispatchCandidate & { score: number; eta: number })[]> {
    if (!candidates.length) return [];
    const ids = candidates.map((c) => c.driverId);
    const stats = new Map<string, { rating: number | null; lastDone: Date | null }>();
    try {
      const rows = await this.rideRepo
        .createQueryBuilder('r')
        .select('r.driverId', 'driverId')
        .addSelect('AVG(r.driverRating)', 'rating')
        .addSelect('MAX(r.completedAt)', 'lastDone')
        .where('r.driverId IN (:...ids)', { ids })
        .andWhere('r.status = :done', { done: RideStatus.COMPLETED })
        .andWhere('r.completedAt >= :since', { since: new Date(Date.now() - 90 * 86400000) })
        .groupBy('r.driverId')
        .getRawMany();
      for (const r of rows) stats.set(r.driverId, { rating: r.rating != null ? Number(r.rating) : null, lastDone: r.lastDone ? new Date(r.lastDone) : null });
    } catch (e: any) {
      this.logger.warn(`Classement des chauffeurs (notes) indisponible : ${e?.message}`);
    }
    return candidates
      .map((c) => {
        const eta = this.etaMinutes(c.distanceKm);
        const s = stats.get(c.driverId);
        const rating = s?.rating ?? 4.5; // nouveau chauffeur : note neutre
        const p = this.perfOf(c.driverId);
        const acceptRate = (p.accepted + 1) / (p.offers + 2);
        const idleMin = s?.lastDone ? (Date.now() - s.lastDone.getTime()) / 60000 : 60;
        const score = eta + (5 - Math.min(5, Math.max(1, rating))) * 1.5 + (1 - acceptRate) * 4 - Math.min(idleMin, 120) / 60;
        return { ...c, eta, score: Math.round(score * 100) / 100 };
      })
      .sort((a, b) => a.score - b.score || a.distanceKm - b.distanceKm);
  }

  onModuleDestroy() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private schedule(rideId: string, seconds: number) {
    this.clear(rideId);
    this.timers.set(
      rideId,
      setTimeout(() => {
        this.timers.delete(rideId);
        void this.runRound(rideId);
      }, seconds * 1000),
    );
  }

  /** Arrête la recherche (course acceptée, annulée…) */
  clear(rideId: string) {
    const t = this.timers.get(rideId);
    if (t) clearTimeout(t);
    this.timers.delete(rideId);
  }

  /** Lance la recherche d'un chauffeur pour une course */
  async start(rideId: string): Promise<number> {
    return this.runRound(rideId);
  }

  /**
   * Un tour de recherche. Renvoie le nombre de chauffeurs sollicités.
   */
  async runRound(rideId: string): Promise<number> {
    if (this.running.has(rideId)) return 0;
    this.running.add(rideId);
    try {
      const ride = await this.rideRepo.findOne({ where: { id: rideId }, relations: ['rider'] });
      if (!ride || ride.driverId || !SEARCHABLE_STATUSES.includes(ride.status)) {
        this.clear(rideId);
        return 0;
      }

      const radii = this.radii;
      const waves = this.waves;
      const round = ride.dispatchRound || 0;
      const rounds = this.roundsCount;
      if (round >= rounds) {
        await this.noDriverFound(ride);
        return 0;
      }
      const wave: Wave | null = this.smart ? waves[round] : null;
      // ✅ broadcast : tous les chauffeurs disponibles (rayon large, sans limite de nombre)
      const radiusKm = wave ? wave.km : this.broadcast ? this.broadcastRadiusKm : radii[round];
      const notified = ride.notifiedDriverIds ?? [];
      const rejected = ride.rejectedDriverIds ?? [];
      const wanted = wave ? wave.count : this.broadcast ? 100000 : this.batchSize;

      const found = await this.driverLocation.findDispatchCandidates({
        lat: Number(ride.pickupLocation.lat),
        lng: Number(ride.pickupLocation.lng),
        radiusKm,
        categoryId: ride.categoryId,
        // ✅ smart : pas de chauffeur qui sonne déjà pour une autre course
        excludeDriverIds: [...notified, ...rejected, ride.riderId, ...(this.smart ? this.busyWithOffer(ride.id) : [])],
        staleSeconds: this.staleSeconds,
        requireKyc: this.requireKyc,
        // smart : on récupère plus de candidats pour les classer, puis on garde les meilleurs
        limit: wave && !wave.broadcast ? Math.max(wanted * 4, 20) : wanted,
        // ✅ Seuls les véhicules qui ont assez de places
        passengers: ride.passengers ?? 1,
      });
      const ranked = wave && !wave.broadcast ? await this.rank(found) : null;
      const candidates: (DispatchCandidate & { score?: number; eta?: number })[] = ranked ? ranked.slice(0, wanted) : found;

      const newIds = candidates.map((c) => c.driverId);
      await this.rideRepo.update(
        { id: ride.id },
        {
          status: RideStatus.SEARCHING,
          dispatchRound: round + 1,
          lastDispatchAt: new Date(),
          notifiedDriverIds: [...new Set([...notified, ...newIds])],
        },
      );
      await this.history.record(ride.id, {
        type: RideEventType.DISPATCH_ROUND,
        fromStatus: ride.status,
        toStatus: RideStatus.SEARCHING,
        payload: {
          round: round + 1,
          mode: this.mode,
          radiusKm,
          count: candidates.length,
          drivers: candidates.slice(0, 200).map((c) => ({ id: c.driverId, km: c.distanceKm, score: c.score ?? null })),
        },
      });

      const isLast = round + 1 >= rounds;
      // ✅ Passager : progression de la recherche
      this.realtime.emitToUsers([ride.riderId], RideSocketEvents.SEARCH_PROGRESS, {
        rideId: ride.id,
        mode: this.mode,
        wave: round + 1,
        totalWaves: rounds,
        radiusKm: wave?.broadcast || this.broadcast ? null : radiusKm,
        driversNotified: [...new Set([...notified, ...candidates.map((c) => c.driverId)])].length,
        newDrivers: candidates.length,
        nearestKm: candidates.length ? Math.min(...candidates.map((c) => c.distanceKm)) : null,
        nearestEtaMin: candidates.length ? this.etaMinutes(Math.min(...candidates.map((c) => c.distanceKm))) : null,
        isLastWave: isLast,
        timestamp: new Date().toISOString(),
      });

      if (!candidates.length) {
        // Personne dans ce rayon : on élargit après une courte attente
        // (des chauffeurs peuvent se connecter entre-temps, comme sur Bolt)
        const wait = this.smart ? (isLast ? this.offerTimeoutSec : 3) : isLast ? this.offerTimeoutSec : Math.ceil(this.offerTimeoutSec / 2);
        this.schedule(ride.id, wait);
        return 0;
      }

      await this.sendOffers(ride, candidates);
      // smart : vague suivante après RIDE_WAVE_INTERVAL_SECONDS (les offres envoyées continuent de sonner)
      this.schedule(ride.id, this.smart && !isLast ? this.waveIntervalSec : this.offerTimeoutSec);
      return candidates.length;
    } catch (e: any) {
      this.logger.error(`Dispatch course ${rideId}: ${e?.message}`);
      this.schedule(rideId, this.offerTimeoutSec);
      return 0;
    } finally {
      this.running.delete(rideId);
    }
  }

  /** Envoie l'offre (WebSocket 'ride:offer' + notification enregistrée + push Firebase) */
  private async sendOffers(
    ride: Ride,
    candidates: { driverId: string; distanceKm: number }[],
  ) {
    const expiresAt = new Date(Date.now() + this.offerTimeoutSec * 1000).toISOString();
    const until = Date.now() + this.offerTimeoutSec * 1000;
    for (const c of candidates) {
      this.activeOffers.set(c.driverId, { rideId: ride.id, until });
      this.perfOf(c.driverId).offers++;
    }
    // ✅ Envoi par paquets de 25 en parallèle : tous les chauffeurs sonnent presque en même temps
    const send = (c: { driverId: string; distanceKm: number }) =>
      this.realtime.notify({
        userIds: [c.driverId],
        audience: 'driver',
        key: 'new_ride',
        params: {
          address: ride.pickupLocation?.address || '',
          km: c.distanceKm,
          minutes: this.etaMinutes(c.distanceKm),
        },
        type: NotificationType.NEW_RIDE,
        rideId: ride.id,
        event: RideSocketEvents.OFFER,
        payload: {
          rideId: ride.id,
          pickupLocation: ride.pickupLocation,
          dropoffLocation: ride.dropoffLocation,
          riderName: ride.rider?.fullName ?? null,
          price: ride.price != null ? Number(ride.price) : null,
          currency: ride.currency ?? null,
          paymentMethod: ride.paymentMethod ?? 'CASH',
          distance: ride.distance != null ? Number(ride.distance) : null,
          duration: ride.duration != null ? Number(ride.duration) : null,
          categoryId: ride.categoryId,
          passengers: ride.passengers ?? 1,
          distanceToPickupKm: c.distanceKm,
          etaToPickupMin: this.etaMinutes(c.distanceKm),
          expiresAt,
        },
        push: 'always',
        // ✅ Appel entrant : le téléphone du chauffeur sonne pendant la durée de l'offre
        pushStyle: 'call',
        ringSeconds: this.offerTimeoutSec,
        save: true,
      });
    for (let i = 0; i < candidates.length; i += 25) {
      await Promise.all(candidates.slice(i, i + 25).map((c) => send(c).catch(() => undefined)));
    }
  }

  /** Un chauffeur refuse : si tout le lot a refusé, tour suivant immédiatement */
  async onRejected(ride: Ride) {
    const notified = ride.notifiedDriverIds ?? [];
    const rejected = new Set(ride.rejectedDriverIds ?? []);
    // Statistiques : chaque refus compté une fois ; le chauffeur peut recevoir une autre offre
    for (const id of rejected) {
      const key = `${ride.id}:${id}`;
      if (!this.countedRejects.has(key)) {
        this.countedRejects.add(key);
        this.perfOf(id).rejected++;
      }
      if (this.activeOffers.get(id)?.rideId === ride.id) this.activeOffers.delete(id);
    }
    if (this.countedRejects.size > 50000) this.countedRejects.clear();
    const pending = notified.filter((id) => !rejected.has(id));
    if (!pending.length) {
      this.clear(ride.id);
      await this.runRound(ride.id);
    }
  }

  /** Prévenir les chauffeurs sollicités que l'offre n'est plus disponible */
  notifyOfferClosed(ride: Pick<Ride, 'id' | 'notifiedDriverIds'> & Partial<Pick<Ride, 'rejectedDriverIds'>>, reason: string, exceptDriverId?: string | null) {
    // Offres libérées : ces chauffeurs peuvent recevoir une autre course
    for (const id of ride.notifiedDriverIds ?? []) {
      if (this.activeOffers.get(id)?.rideId === ride.id) this.activeOffers.delete(id);
    }
    if (reason === 'TAKEN' && exceptDriverId) this.perfOf(exceptDriverId).accepted++;
    const ids = (ride.notifiedDriverIds ?? []).filter((id) => id && id !== exceptDriverId);
    if (!ids.length) return;
    const payload = { rideId: ride.id, reason, timestamp: new Date().toISOString() };
    this.realtime.emitToUsers(ids, RideSocketEvents.OFFER_CANCELLED, payload);
    this.realtime.emitToUsers(ids, RideSocketEvents.LEGACY_CANCELLED, { rideId: ride.id }); // ancien nom
    // ✅ Arrête la sonnerie de l'appel sur les téléphones (app en arrière-plan / fermée)
    //    (pas pour ceux qui ont déjà refusé : leur écran d'appel est déjà fermé)
    const rejected = new Set((ride as Partial<Ride>).rejectedDriverIds ?? []);
    const ringing = ids.filter((id) => !rejected.has(id));
    if (ringing.length) this.realtime.cancelCall(ringing, ride.id, reason);
    // ✅ L'offre ne les concerne plus : retirée de leur liste de notifications
    void this.realtime.clearOfferNotifications(ids, ride.id);
  }

  /** Aucun chauffeur après le dernier tour : course annulée par le système */
  private async noDriverFound(ride: Ride) {
    this.clear(ride.id);
    const res = await this.rideRepo
      .createQueryBuilder()
      .update(Ride)
      .set({
        status: RideStatus.CANCELLED,
        cancelledBy: 'SYSTEM',
        cancellationReason: 'NO_DRIVER_FOUND',
        cancelledAt: new Date(),
        // ✅ Aucun chauffeur : rien à payer, le paiement ne reste pas « en attente »
        paymentStatus: 'CANCELLED',
      })
      .where('id = :id AND driverId IS NULL AND status IN (:...st)', { id: ride.id, st: SEARCHABLE_STATUSES })
      .execute();
    if (!res.affected) return;

    await this.history.record(ride.id, {
      type: RideEventType.NO_DRIVER_FOUND,
      fromStatus: ride.status,
      toStatus: RideStatus.CANCELLED,
      payload: { rounds: ride.dispatchRound, notified: (ride.notifiedDriverIds ?? []).length },
    });
    this.notifyOfferClosed(ride, 'NO_DRIVER_FOUND');
    await this.realtime.notify({
      userIds: [ride.riderId],
      audience: 'rider',
      key: 'no_driver',
      type: NotificationType.RIDE_NO_DRIVER,
      rideId: ride.id,
      event: RideSocketEvents.NO_DRIVER,
      payload: { rideId: ride.id, status: RideStatus.CANCELLED },
    });
  }

  /**
   * Filet de sécurité (redémarrage du serveur, minuterie perdue) :
   * reprend les courses en recherche dont le tour est échu.
   */
  @Interval('ride-dispatch-sweep', 15000)
  async sweep() {
    try {
      const limit = new Date(Date.now() - (this.offerTimeoutSec + 5) * 1000);
      const stuck = await this.rideRepo.find({
        where: [
          { status: RideStatus.SEARCHING, lastDispatchAt: LessThan(limit) },
          { status: RideStatus.PENDING, createdAt: LessThan(new Date(Date.now() - 30000)) },
        ],
        select: ['id', 'driverId', 'status', 'lastDispatchAt'],
        take: 50,
      });
      for (const r of stuck) {
        if (r.driverId || this.timers.has(r.id) || this.running.has(r.id)) continue;
        if (r.status === RideStatus.PENDING && r.lastDispatchAt) continue;
        void this.runRound(r.id);
      }
    } catch (e: any) {
      this.logger.warn(`Balayage dispatch: ${e?.message}`);
    }
  }

  /** Offres encore ouvertes pour un chauffeur (à la reconnexion) */
  async openOffersFor(driverId: string): Promise<Ride[]> {
    const rounds = this.roundsCount;
    const since = new Date(Date.now() - this.offerTimeoutSec * rounds * 1000);
    const rides = await this.rideRepo
      .createQueryBuilder('ride')
      .leftJoinAndSelect('ride.rider', 'rider')
      .where('ride.status IN (:...st)', { st: SEARCHABLE_STATUSES })
      .andWhere('ride.driverId IS NULL')
      .andWhere('ride.lastDispatchAt >= :since', { since })
      .andWhere('JSON_CONTAINS(ride.notifiedDriverIds, JSON_QUOTE(:driverId))', { driverId })
      .andWhere(
        '(ride.rejectedDriverIds IS NULL OR NOT JSON_CONTAINS(ride.rejectedDriverIds, JSON_QUOTE(:driverId)))',
        { driverId },
      )
      .orderBy('ride.createdAt', 'DESC')
      .take(5)
      .getMany();
    return rides;
  }

  /** Utilisé par le sweep et par l'annulation : courses en recherche d'un ensemble d'ids */
  async findSearching(ids: string[]): Promise<Ride[]> {
    if (!ids.length) return [];
    return this.rideRepo.find({ where: { id: In(ids), status: In(SEARCHABLE_STATUSES) } });
  }
}
