import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Ride } from './entity/Ride.entity';
import { CreateRideDto } from './dto/create-ride.dto';
import { UpdateRideDto } from './dto/update-ride.dto';
import {
  CompleteRideDto,
  RateRideDto,
  RideEstimateDto,
  RideHistoryQueryDto,
} from './dto/ride-actions.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { City } from 'src/company/entities/city.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { RideStatus } from './enum/RideStatus.enum';
import { RideActor, RideEventType, RideSocketEvents } from './enum/ride-event.enum';
import { DriverLocationService } from '../DriverLocation/driver-location.service';
import { DriverVehicle } from '../DriverVehicle/entity/DriverVehicle.entity';
import { Pricing } from '../Pricing/entity/Pricing.entity';
import { NotificationsService } from 'src/notification/notifications.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { NotificationHelper } from 'src/notification/utils/notification.helper';
import { I18nService } from 'src/libs/common/src';
import { RideRealtimeService } from './ride-realtime.service';
import { RideHistoryService } from './ride-history.service';
import { haversineKm, RideDispatchService, SEARCHABLE_STATUSES } from './ride-dispatch.service';

/** Statuts où le chauffeur est engagé sur la course */
export const DRIVER_ACTIVE_STATUSES = [RideStatus.ACCEPTED, RideStatus.ARRIVED, RideStatus.IN_PROGRESS];
/** Statuts d'une course « en cours » (passager) */
export const RIDE_ACTIVE_STATUSES = [...SEARCHABLE_STATUSES, ...DRIVER_ACTIVE_STATUSES];

const ADMIN_ROLES: string[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

@Injectable()
export class RideService implements OnModuleInit {
  private readonly logger = new Logger(RideService.name);

  /** chauffeur → course en cours (cache pour le suivi de position) */
  private readonly driverActiveRide = new Map<string, { rideId: string; at: number }>();
  /** limite la diffusion de position (ms) */
  private readonly lastPositionEmit = new Map<string, number>();

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(Pricing)
    private readonly pricingRepo: Repository<Pricing>,
    @InjectRepository(DriverVehicle)
    private readonly vehicleRepo: Repository<DriverVehicle>,

    private readonly driverLocationService: DriverLocationService,

    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,

    private readonly notificationHelper: NotificationHelper,
    private readonly i18n: I18nService,

    // ✅ AJOUT : temps réel (WebSocket + Firebase), recherche de chauffeur, historique
    private readonly realtime: RideRealtimeService,
    private readonly dispatch: RideDispatchService,
    private readonly history: RideHistoryService,
    private readonly config: ConfigService,
  ) { }

  /** Branche le suivi de position du chauffeur (REST /driver-location/update ou WebSocket) */
  onModuleInit() {
    this.driverLocationService.onLocationUpdated((driverId, pos) => this.onDriverPosition(driverId, pos));
  }

  // ============================================================
  // OUTILS
  // ============================================================

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.i18n.translate(key, lang, params);
  }

  private flag(name: string, def: boolean): boolean {
    const v = this.config.get<string>(name);
    if (v === undefined || v === null || v === '') return def;
    return String(v).toLowerCase() === 'true';
  }

  private isAdmin(user?: UserEntity | null) {
    return !!user && ADMIN_ROLES.includes(user.role as any);
  }

  private round2(n: number) {
    return Math.round(Number(n) * 100) / 100;
  }

  /** Distance en km : accepte des km ou des mètres (comparée à la distance à vol d'oiseau) */
  normalizeDistanceKm(value: number | null | undefined, straightKm: number): number {
    const v = Number(value);
    if (!value || !Number.isFinite(v) || v <= 0) return this.round2(Math.max(straightKm * 1.3, 0.5));
    const asKm = v;
    const asMeters = v / 1000;
    const expected = Math.max(straightKm * 1.3, 0.3);
    const score = (x: number) => Math.abs(Math.log(x / expected));
    return this.round2(score(asMeters) < score(asKm) ? asMeters : asKm);
  }

  /** Durée en minutes : accepte des minutes ou des secondes */
  normalizeDurationMin(value: number | null | undefined, km: number): number {
    const expected = Math.max((km / this.dispatch.avgSpeedKmh) * 60, 1);
    const v = Number(value);
    if (!value || !Number.isFinite(v) || v <= 0) return Math.round(expected);
    const score = (x: number) => Math.abs(Math.log(x / expected));
    return Math.round(score(v / 60) < score(v) ? v / 60 : v);
  }

  private commissionFraction(rate: number | null | undefined): number {
    const r = Number(rate || 0);
    if (r <= 0) return 0;
    return r > 1 ? r / 100 : r; // 15 → 15 %, 0.15 → 15 %
  }

  computePrice(pricing: Pricing, km: number, minutes: number, surge = 1) {
    const raw =
      Number(pricing.baseFare) + Number(pricing.pricePerKm) * km + Number(pricing.pricePerMinute) * minutes;
    const price = this.round2(Math.max(raw * (Number(surge) || 1), Number(pricing.minimumFare) || 0));
    const commission = this.round2(price * this.commissionFraction(pricing.commissionRate));
    return { price, commission, driverEarning: this.round2(price - commission) };
  }

  private cityCurrency(city?: City | null): string | null {
    const tarif: any = (city as any)?.tarif;
    return tarif?.currency || null;
  }

  private async findPricing(cityId: string, categoryId: string): Promise<Pricing | null> {
    return this.pricingRepo.findOne({ where: { cityId, categoryId, isActive: true } });
  }

  private async getRideOrFail(id: string, lang: string, relations: string[] = []): Promise<Ride> {
    const ride = await this.rideRepo.findOne({ where: { id }, relations });
    if (!ride) throw new NotFoundException(this.t('ride.ride_not_found', lang));
    return ride;
  }

  private assertRider(ride: Ride, user: UserEntity, lang: string) {
    if (ride.riderId !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException(this.t('ride.forbidden', lang));
    }
  }

  private assertDriver(ride: Ride, user: UserEntity, lang: string) {
    if (ride.driverId !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException(this.t('ride.not_your_ride', lang));
    }
  }

  private assertStatus(ride: Ride, allowed: RideStatus[], lang: string) {
    if (!allowed.includes(ride.status)) {
      throw new BadRequestException(this.t('ride.invalid_status', lang, { status: ride.status }));
    }
  }

  /** Infos publiques du chauffeur + véhicule + note moyenne (pour le passager) */
  async driverCard(driverId: string, vehicleId?: string | null) {
    const [driver, vehicle, rating, location] = await Promise.all([
      this.userRepo.findOne({ where: { id: driverId } }),
      vehicleId ? this.vehicleRepo.findOne({ where: { id: vehicleId } }) : this.driverLocationService.getActiveVehicle(driverId),
      this.rideRepo
        .createQueryBuilder('r')
        .select('AVG(r.driverRating)', 'avg')
        .addSelect('COUNT(r.driverRating)', 'count')
        .where('r.driverId = :driverId', { driverId })
        .getRawOne(),
      this.driverLocationService.findLocation(driverId),
    ]);
    return {
      driver: driver
        ? { id: driver.id, fullName: driver.fullName, phone: driver.phone, image: driver.image }
        : { id: driverId },
      vehicle: vehicle
        ? { id: vehicle.id, model: vehicle.model, plateNumber: vehicle.plateNumber, color: vehicle.color, year: vehicle.year, categoryId: vehicle.categoryId }
        : null,
      rating: rating?.avg ? Math.round(Number(rating.avg) * 10) / 10 : null,
      ratingCount: Number(rating?.count || 0),
      location: location ? { lat: Number(location.lat), lng: Number(location.lng) } : null,
    };
  }

  /** Données envoyées à chaque changement d'état */
  private ridePayload(ride: Ride, extra: Record<string, any> = {}) {
    return {
      rideId: ride.id,
      status: ride.status,
      riderId: ride.riderId,
      driverId: ride.driverId ?? null,
      pickupLocation: ride.pickupLocation,
      dropoffLocation: ride.dropoffLocation,
      price: ride.price != null ? Number(ride.price) : null,
      finalPrice: ride.finalPrice != null ? Number(ride.finalPrice) : null,
      currency: ride.currency ?? null,
      paymentMethod: ride.paymentMethod ?? 'CASH',
      distance: ride.distance != null ? Number(ride.distance) : null,
      duration: ride.duration != null ? Number(ride.duration) : null,
      timestamp: new Date().toISOString(),
      ...extra,
    };
  }

  // ============================================================
  // ESTIMATION (avant de commander)
  // ============================================================

  async estimate(dto: RideEstimateDto, lang: string = 'fr') {
    const city = await this.cityRepo.findOne({ where: { id: dto.cityId, status: true } });
    if (!city) throw new NotFoundException(this.t('ride.city_not_found_or_inactive', lang));

    const straight = haversineKm(dto.pickupLocation, dto.dropoffLocation);
    const km = this.normalizeDistanceKm(dto.distance, straight);
    const minutes = this.normalizeDurationMin(dto.duration, km);

    const where: any = { cityId: dto.cityId, isActive: true };
    if (dto.categoryId) where.categoryId = dto.categoryId;
    const pricings = await this.pricingRepo.find({ where, relations: ['category'] });

    const options = await Promise.all(
      pricings.map(async (p) => {
        const nearby = await this.driverLocationService.findDispatchCandidates({
          lat: dto.pickupLocation.lat,
          lng: dto.pickupLocation.lng,
          radiusKm: this.dispatch.radii[this.dispatch.radii.length - 1],
          categoryId: p.categoryId,
          staleSeconds: this.dispatch.staleSeconds,
          requireKyc: this.dispatch.requireKyc,
          limit: 1,
        });
        const { price } = this.computePrice(p, km, minutes);
        return {
          categoryId: p.categoryId,
          category: p.category ? { id: p.category.id, name: p.category.name, image: (p.category as any).image ?? null } : null,
          price,
          currency: this.cityCurrency(city),
          nearestDriverKm: nearby[0]?.distanceKm ?? null,
          pickupEtaMin: nearby[0] ? this.dispatch.etaMinutes(nearby[0].distanceKm) : null,
          available: nearby.length > 0,
        };
      }),
    );

    return {
      message: this.t('ride.estimate_ready', lang),
      data: { distanceKm: km, durationMin: minutes, options: options.sort((a, b) => a.price - b.price) },
    };
  }

  // ============================================================
  // CRÉATION → RECHERCHE DE CHAUFFEUR
  // ============================================================

  async create(dto: CreateRideDto, customer: UserEntity, lang: string = 'fr') {
    const rider = await this.userRepo.findOne({ where: { id: customer.id } });
    if (!rider) throw new NotFoundException(this.t('ride.rider_not_found', lang));

    if (!dto.pickupLocation?.lat || !dto.pickupLocation?.lng || !dto.dropoffLocation?.lat || !dto.dropoffLocation?.lng) {
      throw new BadRequestException(this.t('ride.locations_required', lang));
    }

    // Un passager = une course en cours à la fois (comme Bolt)
    if (this.flag('RIDE_ONE_ACTIVE_PER_RIDER', true)) {
      const active = await this.rideRepo.findOne({
        where: { riderId: customer.id, status: In(RIDE_ACTIVE_STATUSES) },
        order: { createdAt: 'DESC' },
      });
      if (active) {
        throw new ConflictException({
          message: this.t('ride.already_active_ride', lang),
          data: { rideId: active.id, status: active.status },
        });
      }
    }

    let requestedDriverId: string | null = null;
    if (dto.driverId) {
      const driver = await this.userRepo.findOne({ where: { id: dto.driverId } });
      if (!driver) throw new NotFoundException(this.t('ride.driver_not_found', lang));
      requestedDriverId = driver.id;
    }

    const city = await this.cityRepo.findOne({ where: { id: dto.cityId, status: true } });
    if (!city) throw new NotFoundException(this.t('ride.city_not_found_or_inactive', lang));

    const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId, status: true } });
    if (!category) throw new NotFoundException(this.t('ride.category_not_found_or_inactive', lang));

    // ✅ Prix calculé par le serveur (table pricings) — le prix de l'app sert de repli
    const straight = haversineKm(dto.pickupLocation, dto.dropoffLocation);
    const km = this.normalizeDistanceKm(dto.distance, straight);
    const minutes = this.normalizeDurationMin(dto.duration, km);
    const pricing = await this.findPricing(dto.cityId, dto.categoryId);
    let price = dto.price ?? null;
    if (pricing && this.flag('RIDE_SERVER_PRICING', true)) {
      price = this.computePrice(pricing, km, minutes, dto.surgeMultiplier ?? 1).price;
    }

    const { driverId: _ignored, ...rest } = dto;
    const ride = this.rideRepo.create({
      ...rest,
      riderId: customer.id,
      price: price as any,
      currency: this.cityCurrency(city),
      paymentMethod: dto.paymentMethod ?? 'CASH',
      status: RideStatus.PENDING,
      dispatchRound: 0,
      notifiedDriverIds: requestedDriverId ? [] : null,
    });
    const saved = await this.rideRepo.save(ride);

    await this.history.record(saved.id, {
      type: RideEventType.CREATED,
      toStatus: RideStatus.PENDING,
      actorId: customer.id,
      actorRole: 'RIDER',
      lat: dto.pickupLocation.lat,
      lng: dto.pickupLocation.lng,
      payload: { km, minutes, price, requestedDriverId, pricingId: pricing?.id ?? null },
    });

    // Le passager suit sa course
    this.realtime.joinRide([customer.id], saved.id);
    await this.realtime.notify({
      userIds: [customer.id],
      key: 'searching',
      type: NotificationType.RIDE_SEARCHING,
      rideId: saved.id,
      event: RideSocketEvents.SEARCHING,
      payload: this.ridePayload(saved),
      push: 'never',
      lang,
    });

    // Chauffeur demandé explicitement : il reçoit l'offre en premier
    let notified = 0;
    if (requestedDriverId) {
      await this.rideRepo.update({ id: saved.id }, {
        status: RideStatus.SEARCHING,
        notifiedDriverIds: [requestedDriverId],
        lastDispatchAt: new Date(),
      });
      await this.realtime.notify({
        userIds: [requestedDriverId],
        key: 'new_ride',
        params: { address: dto.pickupLocation.address || '', km: '', minutes: '' },
        type: NotificationType.NEW_RIDE,
        rideId: saved.id,
        event: RideSocketEvents.OFFER,
        payload: { ...this.ridePayload(saved), riderName: rider.fullName, requested: true },
        lang,
      });
      notified = 1;
    } else {
      notified = await this.dispatch.start(saved.id);
    }

    const fresh = await this.rideRepo.findOne({ where: { id: saved.id } });
    return {
      message: this.t('ride.ride_created_success', lang),
      data: {
        ...(fresh ?? saved),
        notificationsSent: notified,
      },
    };
  }

  // ============================================================
  // ACCEPTATION (verrou : un seul chauffeur gagne)
  // ============================================================

  /**
   * Accepter une course. Renvoie la course mise à jour.
   * Utilisé par POST /rides/:id/accept, l'événement 'ride:accept' et l'ancien 'accept-ride'.
   */
  async acceptRide(rideId: string, driverId: string, lang: string = 'fr'): Promise<Ride> {
    const ride = await this.getRideOrFail(rideId, lang);
    if (ride.driverId) {
      if (ride.driverId === driverId) return ride; // double clic
      throw new BadRequestException(this.t('ride.ride_already_accepted', lang));
    }
    if (!SEARCHABLE_STATUSES.includes(ride.status)) {
      throw new BadRequestException(this.t('ride.ride_no_longer_available', lang));
    }
    if (ride.riderId === driverId) throw new BadRequestException(this.t('ride.cannot_accept_own', lang));

    const driver = await this.userRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException(this.t('ride.driver_not_found', lang));

    const vehicle =
      (await this.driverLocationService.getActiveVehicle(driverId, ride.categoryId)) ??
      (await this.driverLocationService.getActiveVehicle(driverId));
    if (!vehicle) throw new BadRequestException(this.t('ride.no_active_vehicle', lang));

    const busy = await this.rideRepo.count({ where: { driverId, status: In(DRIVER_ACTIVE_STATUSES) } });
    if (busy) throw new BadRequestException(this.t('ride.driver_has_active_ride', lang));

    const res = await this.rideRepo
      .createQueryBuilder()
      .update(Ride)
      .set({ driverId, vehicleId: vehicle.id, status: RideStatus.ACCEPTED, acceptedAt: new Date() })
      .where('id = :id AND driverId IS NULL AND status IN (:...st)', { id: rideId, st: SEARCHABLE_STATUSES })
      .execute();
    if (!res.affected) throw new BadRequestException(this.t('ride.ride_already_accepted', lang));

    this.dispatch.clear(rideId);
    await this.driverLocationService.setBusySafe(driverId, true);
    this.driverActiveRide.set(driverId, { rideId, at: Date.now() });

    const updated = await this.getRideOrFail(rideId, lang);
    await this.history.record(rideId, {
      type: RideEventType.ACCEPTED,
      fromStatus: ride.status,
      toStatus: RideStatus.ACCEPTED,
      actorId: driverId,
      actorRole: 'DRIVER',
      payload: { vehicleId: vehicle.id },
    });

    // Les autres chauffeurs sollicités : offre retirée
    this.dispatch.notifyOfferClosed(ride, 'TAKEN', driverId);

    // Passager + chauffeur dans la room de la course
    this.realtime.joinRide([ride.riderId, driverId], rideId);
    const card = await this.driverCard(driverId, vehicle.id);
    const pickupKm = card.location ? haversineKm(card.location, ride.pickupLocation) : null;
    const etaToPickupMin = pickupKm != null ? this.dispatch.etaMinutes(pickupKm) : null;
    const payload = this.ridePayload(updated, {
      ...card,
      distanceToPickupKm: pickupKm,
      etaToPickupMin,
    });

    await this.realtime.notify({
      userIds: [ride.riderId],
      key: 'accepted',
      params: {
        driverName: driver.fullName || '',
        vehicle: [vehicle.model, vehicle.color].filter(Boolean).join(' '),
        plate: vehicle.plateNumber || '',
        minutes: etaToPickupMin ?? '',
      },
      type: NotificationType.RIDE_ACCEPTED,
      rideId,
      event: RideSocketEvents.ACCEPTED,
      payload,
      lang,
    });
    this.realtime.emitToUser(driverId, RideSocketEvents.ACCEPTED, payload);
    this.realtime.emitToUser(driverId, RideSocketEvents.LEGACY_ACCEPTED, { rideId }); // ancien nom

    return updated;
  }

  /** ⚠️ Conservé (ancien nom) : POST /rides/:id/accept et 'accept-ride' */
  async updateDriver(rideId: string, driverId: string, lang: string = 'fr') {
    return this.acceptRide(rideId, driverId, lang);
  }

  /** Le chauffeur refuse l'offre */
  async rejectOffer(rideId: string, driverId: string, reason?: string, lang: string = 'fr') {
    const ride = await this.getRideOrFail(rideId, lang);
    if (!SEARCHABLE_STATUSES.includes(ride.status) || ride.driverId) {
      return { message: this.t('ride.offer_closed', lang), data: { rideId } };
    }
    const rejected = [...new Set([...(ride.rejectedDriverIds ?? []), driverId])];
    await this.rideRepo.update({ id: rideId }, { rejectedDriverIds: rejected });
    await this.history.record(rideId, {
      type: RideEventType.OFFER_REJECTED,
      actorId: driverId,
      actorRole: 'DRIVER',
      payload: { reason: reason ?? null },
    });
    this.realtime.emitToUser(driverId, RideSocketEvents.OFFER_CANCELLED, { rideId, reason: 'REJECTED' });
    await this.dispatch.onRejected({ ...ride, rejectedDriverIds: rejected } as Ride);
    return { message: this.t('ride.offer_rejected', lang), data: { rideId } };
  }

  // ============================================================
  // ÉTAPES DU TRAJET
  // ============================================================

  async markArrived(rideId: string, user: UserEntity, lang: string = 'fr') {
    const ride = await this.getRideOrFail(rideId, lang);
    this.assertDriver(ride, user, lang);
    if (ride.status === RideStatus.ARRIVED) return { message: this.t('ride.driver_arrived', lang), data: ride };
    this.assertStatus(ride, [RideStatus.ACCEPTED], lang);

    ride.status = RideStatus.ARRIVED;
    ride.arrivedAt = new Date();
    const saved = await this.rideRepo.save(ride);
    const loc = await this.driverLocationService.findLocation(ride.driverId!);
    await this.history.record(rideId, {
      type: RideEventType.DRIVER_ARRIVED,
      fromStatus: RideStatus.ACCEPTED,
      toStatus: RideStatus.ARRIVED,
      actorId: user.id,
      actorRole: 'DRIVER',
      lat: loc ? Number(loc.lat) : null,
      lng: loc ? Number(loc.lng) : null,
    });

    const payload = this.ridePayload(saved);
    await this.realtime.notify({
      userIds: [ride.riderId],
      key: 'driver_arrived',
      params: { driverName: user.fullName || '' },
      type: NotificationType.RIDE_DRIVER_ARRIVED,
      rideId,
      event: RideSocketEvents.DRIVER_ARRIVED,
      payload,
      lang,
    });
    this.realtime.emitToRide(rideId, RideSocketEvents.UPDATED, payload);
    return { message: this.t('ride.driver_arrived', lang), data: saved };
  }

  async startRide(rideId: string, user: UserEntity, lang: string = 'fr') {
    const ride = await this.getRideOrFail(rideId, lang);
    this.assertDriver(ride, user, lang);
    if (ride.status === RideStatus.IN_PROGRESS) return { message: this.t('ride.ride_started', lang), data: ride };
    this.assertStatus(ride, [RideStatus.ACCEPTED, RideStatus.ARRIVED], lang);

    const from = ride.status;
    ride.status = RideStatus.IN_PROGRESS;
    ride.startedAt = new Date();
    if (!ride.arrivedAt) ride.arrivedAt = ride.startedAt;
    const saved = await this.rideRepo.save(ride);
    const loc = await this.driverLocationService.findLocation(ride.driverId!);
    await this.history.record(rideId, {
      type: RideEventType.STARTED,
      fromStatus: from,
      toStatus: RideStatus.IN_PROGRESS,
      actorId: user.id,
      actorRole: 'DRIVER',
      lat: loc ? Number(loc.lat) : null,
      lng: loc ? Number(loc.lng) : null,
    });

    const payload = this.ridePayload(saved);
    await this.realtime.notify({
      userIds: [ride.riderId],
      key: 'started',
      params: { address: ride.dropoffLocation?.address || '' },
      type: NotificationType.RIDE_STARTED,
      rideId,
      event: RideSocketEvents.STARTED,
      payload,
      push: 'offline',
      lang,
    });
    this.realtime.emitToRide(rideId, RideSocketEvents.UPDATED, payload);
    return { message: this.t('ride.ride_started', lang), data: saved };
  }

  async completeRide(rideId: string, user: UserEntity, dto: CompleteRideDto = {}, lang: string = 'fr') {
    const ride = await this.getRideOrFail(rideId, lang);
    this.assertDriver(ride, user, lang);
    if (ride.status === RideStatus.COMPLETED) return { message: this.t('ride.ride_completed', lang), data: ride };
    this.assertStatus(ride, [RideStatus.IN_PROGRESS, RideStatus.ARRIVED], lang);

    const from = ride.status;
    const straight = haversineKm(ride.pickupLocation, ride.dropoffLocation);
    const km = this.normalizeDistanceKm(dto.distance ?? ride.distance, straight);
    const startedAt = ride.startedAt ?? ride.arrivedAt ?? ride.acceptedAt ?? ride.createdAt;
    const realMinutes = Math.max(1, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
    const minutes = dto.duration ? this.normalizeDurationMin(dto.duration, km) : realMinutes;

    const pricing = await this.findPricing(ride.cityId, ride.categoryId);
    let finalPrice = ride.price != null ? Number(ride.price) : null;
    let commission: number | null = null;
    let earning: number | null = null;
    if (pricing) {
      const p = this.computePrice(pricing, km, minutes, Number(ride.surgeMultiplier) || 1);
      // Le prix final ne descend pas sous le prix annoncé (comme Bolt : prix fixe à la commande)
      finalPrice = finalPrice != null && this.flag('RIDE_UPFRONT_PRICE', true) ? Math.max(finalPrice, p.price) : p.price;
      commission = this.round2(finalPrice * this.commissionFraction(pricing.commissionRate));
      earning = this.round2(finalPrice - commission);
    }

    ride.status = RideStatus.COMPLETED;
    ride.completedAt = new Date();
    ride.finalPrice = finalPrice as any;
    ride.commissionAmount = commission as any;
    ride.driverEarning = earning as any;
    if (dto.paymentMethod) ride.paymentMethod = dto.paymentMethod;
    const saved = await this.rideRepo.save(ride);

    await this.driverLocationService.setBusySafe(ride.driverId!, false);
    this.driverActiveRide.delete(ride.driverId!);
    const loc = await this.driverLocationService.findLocation(ride.driverId!);
    await this.history.record(rideId, {
      type: RideEventType.COMPLETED,
      fromStatus: from,
      toStatus: RideStatus.COMPLETED,
      actorId: user.id,
      actorRole: 'DRIVER',
      lat: loc ? Number(loc.lat) : null,
      lng: loc ? Number(loc.lng) : null,
      payload: { km, minutes, finalPrice, commission, driverEarning: earning },
    });

    const payload = this.ridePayload(saved, { commissionAmount: commission, driverEarning: earning, km, minutes });
    await this.realtime.notify({
      userIds: [ride.riderId],
      key: 'completed',
      params: { price: finalPrice ?? '', currency: ride.currency ?? '' },
      type: NotificationType.RIDE_COMPLETED,
      rideId,
      event: RideSocketEvents.COMPLETED,
      payload,
      lang,
    });
    this.realtime.emitToUser(ride.driverId!, RideSocketEvents.COMPLETED, payload);
    this.realtime.leaveRide([ride.riderId, ride.driverId!], rideId);
    return { message: this.t('ride.ride_completed', lang), data: saved };
  }

  // ============================================================
  // ANNULATION
  // ============================================================

  /**
   * ⚠️ Signature conservée. Règles type Bolt :
   *  - passager : possible tant que la course n'a pas démarré ;
   *  - chauffeur : avant le départ → la course repart en recherche d'un autre chauffeur
   *    (RIDE_REDISPATCH_ON_DRIVER_CANCEL=true) ;
   *  - système / admin : toujours.
   */
  async cancelRide(
    rideId: string,
    cancelledBy: RideActor,
    cancellationReason?: string,
    lang: string = 'fr',
    actor?: UserEntity | null,
  ) {
    const ride = await this.getRideOrFail(rideId, lang, ['rider', 'driver']);
    if (actor && cancelledBy === 'RIDER') this.assertRider(ride, actor, lang);
    if (actor && cancelledBy === 'DRIVER' && ride.driverId && ride.driverId !== actor.id) {
      // Un chauffeur non affecté qui « annule » une offre = refus
      await this.rejectOffer(rideId, actor.id, cancellationReason, lang);
      return ride;
    }
    if (actor && cancelledBy === 'DRIVER' && !ride.driverId) {
      await this.rejectOffer(rideId, actor.id, cancellationReason, lang);
      return ride;
    }

    if ([RideStatus.COMPLETED, RideStatus.CANCELLED].includes(ride.status)) {
      throw new BadRequestException(this.t('ride.cannot_cancel', lang, { status: ride.status }));
    }
    if (cancelledBy === 'RIDER' && ride.status === RideStatus.IN_PROGRESS) {
      throw new BadRequestException(this.t('ride.cannot_cancel_in_progress', lang));
    }

    // Chauffeur qui se désiste avant le départ → on cherche un autre chauffeur
    if (
      cancelledBy === 'DRIVER' &&
      ride.driverId &&
      [RideStatus.ACCEPTED, RideStatus.ARRIVED].includes(ride.status) &&
      this.flag('RIDE_REDISPATCH_ON_DRIVER_CANCEL', true)
    ) {
      const driverId = ride.driverId;
      const from = ride.status;
      await this.rideRepo.update({ id: ride.id }, {
        driverId: null as any,
        vehicleId: null,
        status: RideStatus.SEARCHING,
        acceptedAt: null,
        arrivedAt: null,
        dispatchRound: 0,
        rejectedDriverIds: [...new Set([...(ride.rejectedDriverIds ?? []), driverId])],
        cancellationReason: cancellationReason ?? null as any,
      });
      await this.driverLocationService.setBusySafe(driverId, false);
      this.driverActiveRide.delete(driverId);
      this.realtime.leaveRide([driverId], ride.id);
      await this.history.record(ride.id, {
        type: RideEventType.DRIVER_CANCELLED_REDISPATCH,
        fromStatus: from,
        toStatus: RideStatus.SEARCHING,
        actorId: driverId,
        actorRole: 'DRIVER',
        payload: { reason: cancellationReason ?? null },
      });
      const searching = await this.getRideOrFail(ride.id, lang);
      await this.realtime.notify({
        userIds: [ride.riderId],
        key: 'driver_cancelled',
        type: NotificationType.RIDE_SEARCHING,
        rideId: ride.id,
        event: RideSocketEvents.SEARCHING,
        payload: this.ridePayload(searching, { reason: 'DRIVER_CANCELLED' }),
        lang,
      });
      this.realtime.emitToUser(driverId, RideSocketEvents.CANCELLED, this.ridePayload(searching, { cancelledBy: 'DRIVER' }));
      void this.dispatch.start(ride.id);
      return searching;
    }

    const from = ride.status;
    ride.status = RideStatus.CANCELLED;
    ride.cancelledBy = cancelledBy;
    ride.cancelledAt = new Date();
    if (cancellationReason) ride.cancellationReason = cancellationReason;
    const updatedRide = await this.rideRepo.save(ride);

    this.dispatch.clear(ride.id);
    if (ride.driverId) {
      await this.driverLocationService.setBusySafe(ride.driverId, false);
      this.driverActiveRide.delete(ride.driverId);
    }
    this.dispatch.notifyOfferClosed(ride, 'CANCELLED', ride.driverId);

    await this.history.record(ride.id, {
      type: RideEventType.CANCELLED,
      fromStatus: from,
      toStatus: RideStatus.CANCELLED,
      actorId: actor?.id ?? null,
      actorRole: cancelledBy,
      payload: { reason: cancellationReason ?? null },
    });

    const payload = this.ridePayload(updatedRide, { cancelledBy, cancellationReason: cancellationReason ?? null });
    const notifyUserIds = cancelledBy === 'RIDER' ? [ride.driverId] : cancelledBy === 'DRIVER' ? [ride.riderId] : [ride.riderId, ride.driverId];
    await this.realtime.notify({
      userIds: notifyUserIds.filter(Boolean) as string[],
      key: cancelledBy === 'RIDER' ? 'cancelled_by_rider' : cancelledBy === 'DRIVER' ? 'cancelled_by_driver' : 'cancelled_by_system',
      params: { reason: cancellationReason || '' },
      type: NotificationType.RIDE_CANCELLED,
      rideId: ride.id,
      event: RideSocketEvents.CANCELLED,
      payload,
      lang,
    });
    this.realtime.emitToRide(ride.id, RideSocketEvents.CANCELLED, payload);
    this.realtime.leaveRide([ride.riderId, ride.driverId as string], ride.id);

    return updatedRide;
  }

  // ============================================================
  // NOTES
  // ============================================================

  async rateRide(rideId: string, user: UserEntity, dto: RateRideDto, lang: string = 'fr') {
    const ride = await this.getRideOrFail(rideId, lang);
    if (ride.status !== RideStatus.COMPLETED) throw new BadRequestException(this.t('ride.rate_only_completed', lang));
    if (ride.riderId === user.id) {
      if (ride.driverRating) throw new BadRequestException(this.t('ride.already_rated', lang));
      ride.driverRating = dto.rating;
      ride.driverRatingComment = dto.comment ?? null;
    } else if (ride.driverId === user.id) {
      if (ride.riderRating) throw new BadRequestException(this.t('ride.already_rated', lang));
      ride.riderRating = dto.rating;
      ride.riderRatingComment = dto.comment ?? null;
    } else {
      throw new ForbiddenException(this.t('ride.forbidden', lang));
    }
    const saved = await this.rideRepo.save(ride);
    await this.history.record(rideId, {
      type: RideEventType.RATED,
      actorId: user.id,
      actorRole: ride.riderId === user.id ? 'RIDER' : 'DRIVER',
      payload: { rating: dto.rating, comment: dto.comment ?? null },
    });
    return { message: this.t('ride.rating_saved', lang), data: saved };
  }

  // ============================================================
  // SUIVI EN DIRECT DU CHAUFFEUR
  // ============================================================

  private async activeRideOfDriver(driverId: string): Promise<string | null> {
    const cached = this.driverActiveRide.get(driverId);
    if (cached && Date.now() - cached.at < 60000) return cached.rideId;
    const ride = await this.rideRepo.findOne({
      where: { driverId, status: In(DRIVER_ACTIVE_STATUSES) },
      select: ['id'],
      order: { acceptedAt: 'DESC' },
    });
    if (ride) this.driverActiveRide.set(driverId, { rideId: ride.id, at: Date.now() });
    else this.driverActiveRide.delete(driverId);
    return ride?.id ?? null;
  }

  /** Nouvelle position du chauffeur → passager (room ride-<id>), au plus 1 fois / seconde */
  async onDriverPosition(
    driverId: string,
    pos: { lat: number; lng: number; heading?: number | null; speed?: number | null },
  ) {
    const now = Date.now();
    if (now - (this.lastPositionEmit.get(driverId) ?? 0) < 1000) return;
    this.lastPositionEmit.set(driverId, now);

    const rideId = await this.activeRideOfDriver(driverId);
    if (!rideId) return;
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      select: ['id', 'status', 'pickupLocation', 'dropoffLocation', 'riderId', 'driverId'],
    });
    if (!ride || !DRIVER_ACTIVE_STATUSES.includes(ride.status)) {
      this.driverActiveRide.delete(driverId);
      return;
    }
    const target = ride.status === RideStatus.IN_PROGRESS ? ride.dropoffLocation : ride.pickupLocation;
    const km = haversineKm(pos, target);
    this.realtime.emitToRide(rideId, RideSocketEvents.DRIVER_LOCATION, {
      rideId,
      driverId,
      status: ride.status,
      lat: Number(pos.lat),
      lng: Number(pos.lng),
      heading: pos.heading ?? null,
      speed: pos.speed ?? null,
      remainingKm: km,
      etaMinutes: this.dispatch.etaMinutes(km),
      timestamp: new Date(now).toISOString(),
    });
  }

  // ============================================================
  // ÉTAT (reconnexion de l'app) / HISTORIQUE
  // ============================================================

  /** Course en cours d'un utilisateur (passager ou chauffeur) */
  async getActiveRide(userId: string): Promise<Ride | null> {
    return this.rideRepo.findOne({
      where: [
        { riderId: userId, status: In(RIDE_ACTIVE_STATUSES) },
        { driverId: userId, status: In(DRIVER_ACTIVE_STATUSES) },
      ],
      relations: ['category'],
      order: { createdAt: 'DESC' },
    });
  }

  async getStateForUser(userId: string) {
    const ride = await this.getActiveRide(userId);
    if (!ride) return null;
    const role = ride.driverId === userId ? 'DRIVER' : 'RIDER';
    const extra = ride.driverId ? await this.driverCard(ride.driverId, ride.vehicleId) : {};
    return { role, ride: this.ridePayload(ride, extra) };
  }

  async active(user: UserEntity, lang: string = 'fr') {
    const state = await this.getStateForUser(user.id);
    if (state) this.realtime.joinRide([user.id], state.ride.rideId);
    return { message: this.t('ride.active_ride', lang), data: state };
  }

  async myRides(user: UserEntity, query: RideHistoryQueryDto, lang: string = 'fr') {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: any = query.as === 'driver' ? { driverId: user.id } : { riderId: user.id };
    if (query.status) where.status = query.status;
    const [items, total] = await this.rideRepo.findAndCount({
      where,
      relations: ['category', 'city'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      message: this.t('ride.rides_list_retrieved', lang),
      data: { items, total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async events(rideId: string, user: UserEntity, lang: string = 'fr') {
    const ride = await this.getRideOrFail(rideId, lang);
    if (ride.riderId !== user.id && ride.driverId !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException(this.t('ride.forbidden', lang));
    }
    return { message: this.t('ride.history', lang), data: await this.history.list(rideId) };
  }

  /** Offres ouvertes pour un chauffeur (reconnexion) */
  openOffersFor(driverId: string) {
    return this.dispatch.openOffersFor(driverId);
  }

  // ============================================================
  // CRUD EXISTANT (conservé)
  // ============================================================

  async findAll(lang: string = 'fr') {
    const data = await this.rideRepo.find({
      relations: ['rider', 'driver', 'city', 'category'],
      order: { createdAt: 'DESC' },
    });
    return {
      message: await this.i18n.translate('ride.rides_list_retrieved', lang),
      data: data.map((r) => ({
        ...r,
        rider: r.rider ? this.sanitizeUser(r.rider) : null,
        driver: r.driver ? this.sanitizeUser(r.driver) : null,
      })),
    };
  }

  /**
   * ⚠️ Signature conservée (utilisée par NotificationsGateway).
   * Si `user` est fourni : accès réservé au passager, au chauffeur affecté,
   * aux chauffeurs sollicités tant que la course est en recherche, et aux admins.
   */
  async findOne(id: string, lang: string = 'fr', user?: UserEntity | null) {
    const ride = await this.rideRepo.findOne({
      where: { id },
      relations: ['rider', 'driver', 'city', 'category'],
    });

    if (!ride) {
      throw new NotFoundException(await this.i18n.translate('ride.ride_not_found', lang));
    }

    if (user && !this.isAdmin(user) && ride.riderId !== user.id && ride.driverId !== user.id) {
      const isOfferedDriver =
        SEARCHABLE_STATUSES.includes(ride.status) &&
        ((ride.notifiedDriverIds ?? []).includes(user.id) || user.role === UserRole.DRIVER);
      if (!isOfferedDriver) throw new ForbiddenException(this.t('ride.forbidden', lang));
    }

    const extra = ride.driverId ? await this.driverCard(ride.driverId, ride.vehicleId) : {};
    const rideResponse = {
      ...ride,
      rider: ride.rider ? this.sanitizeUser(ride.rider) : null,
      driver: ride.driver ? this.sanitizeUser(ride.driver) : null,
      driverInfo: ride.driverId ? extra : null,
    };

    return {
      message: await this.i18n.translate('ride.ride_retrieved', lang),
      data: rideResponse,
    };
  }

  /**
   * ⚠️ Conservé. Un changement de `status` passe par le cycle de vie (mêmes contrôles que les
   * routes dédiées) ; les autres champs ne sont modifiables que par le passager avant
   * l'acceptation, ou par un admin.
   */
  async update(id: string, dto: UpdateRideDto, lang: string = 'fr', user?: UserEntity | null) {
    const ride = await this.getRideOrFail(id, lang);

    if (dto.status && dto.status !== ride.status && user) {
      switch (dto.status) {
        case RideStatus.ACCEPTED:
          await this.acceptRide(id, user.id, lang);
          break;
        case RideStatus.ARRIVED:
          await this.markArrived(id, user, lang);
          break;
        case RideStatus.IN_PROGRESS:
          await this.startRide(id, user, lang);
          break;
        case RideStatus.COMPLETED:
          await this.completeRide(id, user, { distance: dto.distance, duration: dto.duration }, lang);
          break;
        case RideStatus.CANCELLED: {
          // Qui annule : déduit du lien avec la course (cancelledBy envoyé n'est pris en compte que pour un admin)
          const by: RideActor =
            ride.driverId === user.id
              ? 'DRIVER'
              : ride.riderId === user.id
                ? 'RIDER'
                : this.isAdmin(user)
                  ? (dto.cancelledBy ?? 'SYSTEM')
                  : 'RIDER';
          await this.cancelRide(id, by, dto.cancellationReason, lang, user);
          break;
        }
        default:
          if (!this.isAdmin(user)) throw new BadRequestException(this.t('ride.invalid_status', lang, { status: dto.status }));
      }
      const fresh = await this.getRideOrFail(id, lang);
      return { message: await this.i18n.translate('ride.ride_updated', lang), data: fresh };
    }

    if (user && !this.isAdmin(user)) {
      this.assertRider(ride, user, lang);
      if (!SEARCHABLE_STATUSES.includes(ride.status)) {
        throw new BadRequestException(this.t('ride.cannot_edit_after_accept', lang));
      }
    }

    const { status, cancelledBy, driverId, ...editable } = dto as any;
    Object.assign(ride, user && !this.isAdmin(user) ? editable : dto);
    const updated = await this.rideRepo.save(ride);
    await this.history.record(id, { type: RideEventType.UPDATED, actorId: user?.id ?? null, payload: editable });

    // Sans utilisateur (appel interne historique) : ancien comportement d'annulation conservé
    if (!user && dto.status === RideStatus.CANCELLED && dto.cancelledBy) {
      const notifyUserId = dto.cancelledBy === 'RIDER' ? ride.driverId : ride.riderId;
      if (notifyUserId) {
        await this.notificationHelper.sendNotification(
          this.notificationsService,
          notifyUserId,
          NotificationType.RIDE_CANCELLED,
          lang,
          { rideId: ride.id, cancelledBy: dto.cancelledBy, pickupLocation: ride.pickupLocation },
        );
      }
    }

    this.realtime.emitToRide(id, RideSocketEvents.UPDATED, this.ridePayload(updated));
    return {
      message: await this.i18n.translate('ride.ride_updated', lang),
      data: updated,
    };
  }

  async remove(id: string, lang: string = 'fr') {
    const ride = await this.getRideOrFail(id, lang);
    this.dispatch.clear(id);
    if (ride.driverId && DRIVER_ACTIVE_STATUSES.includes(ride.status)) {
      await this.driverLocationService.setBusySafe(ride.driverId, false);
    }
    await this.rideRepo.remove(ride);
    return {
      message: await this.i18n.translate('ride.ride_deleted', lang),
      data: null,
    };
  }

  // Helper pour nettoyer les objets utilisateur
  private sanitizeUser(user: UserEntity): any {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      image: user.image,
      role: user.role,
      country: user.country,
      city: user.city,
      provider: user.provider,
      isActive: user.isActive,
      deleted: user.deleted,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      address: user.address,
      preferredLanguage: user.preferredLanguage,
      loyaltyPoints: user.loyaltyPoints,
      dateOfBirth: user.dateOfBirth,
      vehicleType: user.vehicleType,
      plateNumber: user.plateNumber,
      licenseDocumentUrl: user.licenseDocumentUrl,
      isTwoFAEnabled: user.isTwoFAEnabled,
      socketId: user.socketId,
      activeCompanyId: user.activeCompanyId,
      defaultAddressId: user.defaultAddressId,
      appleUserId: user.appleUserId,
      vehicles: user.vehicles,
    };
  }
}
