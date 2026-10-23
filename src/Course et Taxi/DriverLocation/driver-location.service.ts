import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import { ChangeDriverStatusDto } from './dto/change-driver-status.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { DriverLocation } from './entity/DriverLocation.entity';
import { DriverStatus } from './dto/driver-status.enum';
import { DriverVehicle } from '../DriverVehicle/entity/DriverVehicle.entity';

/** Appelé à chaque nouvelle position d'un chauffeur (REST ou WebSocket) */
export type DriverLocationHook = (
  driverId: string,
  position: { lat: number; lng: number; heading?: number | null; speed?: number | null },
) => void | Promise<void>;

/** Chauffeur candidat pour une course (dispatch) */
export interface DispatchCandidate {
  driverId: string;
  distanceKm: number;
  lat: number;
  lng: number;
  vehicleId: string;
  categoryId: string;
}

@Injectable()
export class DriverLocationService {
  /**
   * ✅ AJOUT : abonnés aux nouvelles positions (module Ride : suivi en direct du chauffeur).
   * Évite une dépendance circulaire DriverLocation ↔ Ride.
   */
  private readonly locationHooks: DriverLocationHook[] = [];

  onLocationUpdated(hook: DriverLocationHook): void {
    this.locationHooks.push(hook);
  }

  private runLocationHooks(
    driverId: string,
    position: { lat: number; lng: number; heading?: number | null; speed?: number | null },
  ) {
    for (const hook of this.locationHooks) {
      Promise.resolve()
        .then(() => hook(driverId, position))
        .catch((e) => console.error('⚠️ Hook position chauffeur:', e?.message ?? e));
    }
  }

  constructor(
    @InjectRepository(DriverLocation)
    private readonly locationRepository: Repository<DriverLocation>,
    @InjectRepository(DriverVehicle)
    private readonly vehicleRepository: Repository<DriverVehicle>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  // Mise à jour ou création de la position
  async updateLocation(
    driver: UserEntity,
    dto: UpdateDriverLocationDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: DriverLocation;
  }> {
    const hasVehicle = await this.vehicleRepository.exist({
      where: {
        driverId: driver.id,
        isActive: true,
      },
    });

    if (!hasVehicle) {
      throw new BadRequestException('Veuillez ajouter un véhicule actif');
    }

    // 🔵 Récupérer ou créer la localisation
    let location = await this.locationRepository.findOne({
      where: { driverId: driver.id },
    });

    if (!location) {
      location = this.locationRepository.create({
        driverId: driver.id,
        driver,
      });
    }

    location.lat = dto.lat;
    location.lng = dto.lng;

    if (dto.isOnline !== undefined) location.isOnline = dto.isOnline;
    if (dto.isBusy !== undefined) location.isBusy = dto.isBusy;

    const saved = await this.locationRepository.save(location);

    // ✅ AJOUT : diffusion en direct au passager si une course est en cours
    this.runLocationHooks(driver.id, { lat: Number(dto.lat), lng: Number(dto.lng) });

    return {
      success: true,
      message: 'Position mise à jour avec succès',
      data: saved,
    };
  }

  // Changer le statut
  async changeStatus(
    driver: UserEntity,
    dto: ChangeDriverStatusDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: DriverLocation;
  }> {
    const location = await this.locationRepository.findOne({
      where: { driverId: driver.id },
    });

    if (!location) {
      throw new NotFoundException('Localisation du chauffeur introuvable');
    }

    switch (dto.status) {
      case DriverStatus.OFFLINE:
        location.isOnline = false;
        location.isBusy = false;
        break;

      case DriverStatus.ONLINE:
        location.isOnline = true;
        location.isBusy = false;
        break;

      case DriverStatus.BUSY:
        location.isOnline = true;
        location.isBusy = true;
        break;
    }

    const updated = await this.locationRepository.save(location);

    return {
      success: true,
      message: `Statut changé vers ${dto.status}`,
      data: updated,
    };
  }

  // Chauffeurs disponibles
  async findAvailableDrivers(): Promise<{
    success: boolean;
    message: string;
    data: DriverLocation[];
  }> {
    const drivers = await this.locationRepository.find({
      where: {
        isOnline: true,
        isBusy: false,
      },
      relations: ['driver'],
      select: {
        id: true,
        driverId: true,
        lat: true,
        lng: true,
        isOnline: true,
        isBusy: true,
        updatedAt: true,
        driver: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          image: true,
          role: true,
        },
      },
    });

    return {
      success: true,
      message: `${drivers.length} chauffeur(s) disponible(s)`,
      data: drivers,
    };
  }

  // Position d’un chauffeur
  async getDriverLocation(driverId: string): Promise<{
    success: boolean;
    message: string;
    data: DriverLocation;
  }> {
    const location = await this.locationRepository.findOne({
      where: { driverId },
      relations: ['driver'],
      select: {
        id: true,
        driverId: true,
        lat: true,
        lng: true,
        isOnline: true,
        isBusy: true,
        updatedAt: true,
        driver: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          image: true,
          role: true,
        },
      },
    });

    if (!location) {
      throw new NotFoundException('Localisation introuvable');
    }

    return {
      success: true,
      message: 'Position récupérée avec succès',
      data: location,
    };
  }

  async findDriversNear(
    lat: number,
    lng: number,
    radiusKm = 5,
  ): Promise<UserEntity[]> {
    const drivers = await this.locationRepository
      .createQueryBuilder('location')
      .innerJoinAndSelect('location.driver', 'driver')
      .where('location.isOnline = :isOnline', { isOnline: true })
      .andWhere('location.isBusy = :isBusy', { isBusy: false })
      .andWhere(
        `(
        6371 * acos(
          cos(radians(:lat)) * 
          cos(radians(location.lat)) * 
          cos(radians(location.lng) - radians(:lng)) + 
          sin(radians(:lat)) * 
          sin(radians(location.lat))
        )
      ) <= :radius`,
        { lat, lng, radius: radiusKm },
      )
      .getMany();

    return drivers.map((dl) => dl.driver);
  }

  async setDriverBusy(driverId: string): Promise<{
    success: boolean;
    message: string;
    data: DriverLocation;
  }> {
    // Récupérer la localisation du chauffeur
    const location = await this.locationRepository.findOne({
      where: { driverId },
    });

    if (!location) {
      throw new NotFoundException('Localisation du chauffeur introuvable');
    }

    // Vérifier que le chauffeur est en ligne
    if (!location.isOnline) {
      throw new BadRequestException("Le chauffeur n'est pas en ligne");
    }

    // Marquer comme occupé
    location.isBusy = true;
    location.isOnline = true; // Rester en ligne mais occupé

    const updated = await this.locationRepository.save(location);

    return {
      success: true,
      message: 'Chauffeur marqué comme occupé',
      data: updated,
    };
  }

  /**
   * Marquer un chauffeur comme disponible (non occupé)
   * @param driverId L'ID du chauffeur
   */
  async setDriverAvailable(driverId: string): Promise<{
    success: boolean;
    message: string;
    data: DriverLocation;
  }> {
    const location = await this.locationRepository.findOne({
      where: { driverId },
    });

    if (!location) {
      throw new NotFoundException('Localisation du chauffeur introuvable');
    }

    location.isBusy = false;
    location.isOnline = true;

    const updated = await this.locationRepository.save(location);

    return {
      success: true,
      message: 'Chauffeur marqué comme disponible',
      data: updated,
    };
  }

  // ============================================================
  // ✅ AJOUT : méthodes utilisées par le dispatch des courses
  // ============================================================

  /** Le chauffeur a-t-il un véhicule actif ? (catégorie optionnelle) */
  async getActiveVehicle(driverId: string, categoryId?: string): Promise<DriverVehicle | null> {
    const where: any = { driverId, isActive: true };
    if (categoryId) where.categoryId = categoryId;
    const vehicles = await this.vehicleRepository.find({ where, order: { isDefault: 'DESC' } });
    return vehicles[0] ?? null;
  }

  /**
   * Position envoyée en continu (WebSocket) : met à jour sans renvoyer d'erreur
   * et déclenche le suivi en direct. Crée la ligne si elle n'existe pas encore.
   */
  async updatePositionLive(
    driverId: string,
    pos: { lat: number; lng: number; heading?: number | null; speed?: number | null },
    online?: boolean,
  ): Promise<DriverLocation | null> {
    try {
      let location = await this.locationRepository.findOne({ where: { driverId } });
      if (!location) {
        location = this.locationRepository.create({ driverId, isOnline: online ?? true, isBusy: false });
      }
      location.lat = Number(pos.lat);
      location.lng = Number(pos.lng);
      if (online !== undefined) location.isOnline = online;
      const saved = await this.locationRepository.save(location);
      this.runLocationHooks(driverId, pos);
      return saved;
    } catch (e: any) {
      console.error(`⚠️ updatePositionLive(${driverId}): ${e?.message}`);
      return null;
    }
  }

  /** En ligne / hors ligne sans lever d'erreur (WebSocket) */
  async setOnlineSafe(driverId: string, online: boolean): Promise<void> {
    const location = await this.locationRepository.findOne({ where: { driverId } });
    if (!location) return;
    location.isOnline = online;
    if (!online) location.isBusy = false;
    await this.locationRepository.save(location);
  }

  /** Occupé / disponible sans lever d'erreur (fin ou annulation de course) */
  async setBusySafe(driverId: string, busy: boolean): Promise<void> {
    if (!driverId) return;
    try {
      await this.locationRepository.update({ driverId }, { isBusy: busy });
    } catch (e: any) {
      console.error(`⚠️ setBusySafe(${driverId}): ${e?.message}`);
    }
  }

  /** Position actuelle (ou null) */
  async findLocation(driverId: string): Promise<DriverLocation | null> {
    return this.locationRepository.findOne({ where: { driverId } });
  }

  /**
   * Chauffeurs à proposer pour une course, triés du plus proche au plus loin :
   *  - en ligne et libres ;
   *  - position récente (staleSeconds) ;
   *  - véhicule actif de la catégorie demandée (KYC approuvé si requireKyc) ;
   *  - hors liste d'exclusion (déjà sollicités, refus).
   */
  async findDispatchCandidates(options: {
    lat: number;
    lng: number;
    radiusKm: number;
    categoryId?: string | null;
    excludeDriverIds?: string[];
    staleSeconds?: number;
    requireKyc?: boolean;
    limit?: number;
  }): Promise<DispatchCandidate[]> {
    const distanceSql = `(6371 * acos(LEAST(1, GREATEST(-1,
        cos(radians(:lat)) * cos(radians(location.lat)) * cos(radians(location.lng) - radians(:lng)) +
        sin(radians(:lat)) * sin(radians(location.lat))))))`;

    const qb = this.locationRepository
      .createQueryBuilder('location')
      .innerJoin(DriverVehicle, 'vehicle', 'vehicle.driverId = location.driverId AND vehicle.isActive = 1')
      .select('location.driverId', 'driverId')
      .addSelect('location.lat', 'lat')
      .addSelect('location.lng', 'lng')
      .addSelect('vehicle.id', 'vehicleId')
      .addSelect('vehicle.categoryId', 'categoryId')
      .addSelect(distanceSql, 'distanceKm')
      .where('location.isOnline = 1')
      .andWhere('location.isBusy = 0')
      .andWhere(`${distanceSql} <= :radius`)
      .setParameters({ lat: options.lat, lng: options.lng, radius: options.radiusKm });

    if (options.categoryId) qb.andWhere('vehicle.categoryId = :categoryId', { categoryId: options.categoryId });
    if (options.requireKyc) qb.andWhere("vehicle.kycStatus = 'APPROVED'");
    if (options.staleSeconds && options.staleSeconds > 0) {
      qb.andWhere('location.updatedAt >= :fresh', { fresh: new Date(Date.now() - options.staleSeconds * 1000) });
    }
    const exclude = (options.excludeDriverIds ?? []).filter(Boolean);
    if (exclude.length) qb.andWhere('location.driverId NOT IN (:...exclude)', { exclude });

    const rows = await qb.orderBy('distanceKm', 'ASC').limit((options.limit ?? 5) * 3).getRawMany();

    // Un seul véhicule par chauffeur (le plus proche suffit)
    const seen = new Set<string>();
    const out: DispatchCandidate[] = [];
    for (const r of rows) {
      if (seen.has(r.driverId)) continue;
      seen.add(r.driverId);
      out.push({
        driverId: r.driverId,
        distanceKm: Math.round(Number(r.distanceKm) * 100) / 100,
        lat: Number(r.lat),
        lng: Number(r.lng),
        vehicleId: r.vehicleId,
        categoryId: r.categoryId,
      });
      if (out.length >= (options.limit ?? 5)) break;
    }
    return out;
  }
}
