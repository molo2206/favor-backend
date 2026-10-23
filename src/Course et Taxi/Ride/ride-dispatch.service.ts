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
import { DriverLocationService } from '../DriverLocation/driver-location.service';

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
 * Recherche de chauffeur façon Bolt :
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
  get offerTimeoutSec(): number {
    return Math.max(5, Number(this.config.get('RIDE_OFFER_TIMEOUT_SECONDS') || 20));
  }
  get staleSeconds(): number {
    return Math.max(0, Number(this.config.get('RIDE_DRIVER_STALE_SECONDS') || 180));
  }
  get requireKyc(): boolean {
    return String(this.config.get('RIDE_REQUIRE_KYC') || 'false').toLowerCase() === 'true';
  }
  get avgSpeedKmh(): number {
    return Math.max(5, Number(this.config.get('RIDE_AVG_SPEED_KMH') || 25));
  }

  etaMinutes(km: number): number {
    return Math.max(1, Math.round((km / this.avgSpeedKmh) * 60));
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
      const round = ride.dispatchRound || 0;
      if (round >= radii.length) {
        await this.noDriverFound(ride);
        return 0;
      }
      const radiusKm = radii[round];
      const notified = ride.notifiedDriverIds ?? [];
      const rejected = ride.rejectedDriverIds ?? [];

      const candidates = await this.driverLocation.findDispatchCandidates({
        lat: Number(ride.pickupLocation.lat),
        lng: Number(ride.pickupLocation.lng),
        radiusKm,
        categoryId: ride.categoryId,
        excludeDriverIds: [...notified, ...rejected, ride.riderId],
        staleSeconds: this.staleSeconds,
        requireKyc: this.requireKyc,
        limit: this.batchSize,
      });

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
        payload: { round: round + 1, radiusKm, drivers: candidates.map((c) => ({ id: c.driverId, km: c.distanceKm })) },
      });

      if (!candidates.length) {
        // Personne dans ce rayon : on élargit après une courte attente
        // (des chauffeurs peuvent se connecter entre-temps, comme sur Bolt)
        const isLast = round + 1 >= radii.length;
        this.schedule(ride.id, isLast ? this.offerTimeoutSec : Math.ceil(this.offerTimeoutSec / 2));
        return 0;
      }

      await this.sendOffers(ride, candidates);
      this.schedule(ride.id, this.offerTimeoutSec);
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
    for (const c of candidates) {
      await this.realtime.notify({
        userIds: [c.driverId],
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
          distanceToPickupKm: c.distanceKm,
          etaToPickupMin: this.etaMinutes(c.distanceKm),
          expiresAt,
        },
        push: 'always',
        save: true,
      });
    }
  }

  /** Un chauffeur refuse : si tout le lot a refusé, tour suivant immédiatement */
  async onRejected(ride: Ride) {
    const notified = ride.notifiedDriverIds ?? [];
    const rejected = new Set(ride.rejectedDriverIds ?? []);
    const pending = notified.filter((id) => !rejected.has(id));
    if (!pending.length) {
      this.clear(ride.id);
      await this.runRound(ride.id);
    }
  }

  /** Prévenir les chauffeurs sollicités que l'offre n'est plus disponible */
  notifyOfferClosed(ride: Pick<Ride, 'id' | 'notifiedDriverIds'>, reason: string, exceptDriverId?: string | null) {
    const ids = (ride.notifiedDriverIds ?? []).filter((id) => id && id !== exceptDriverId);
    if (!ids.length) return;
    const payload = { rideId: ride.id, reason, timestamp: new Date().toISOString() };
    this.realtime.emitToUsers(ids, RideSocketEvents.OFFER_CANCELLED, payload);
    this.realtime.emitToUsers(ids, RideSocketEvents.LEGACY_CANCELLED, { rideId: ride.id }); // ancien nom
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
    const since = new Date(Date.now() - this.offerTimeoutSec * this.radii.length * 1000);
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
