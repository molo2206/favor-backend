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

@Injectable()
export class DriverLocationService {
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
}
