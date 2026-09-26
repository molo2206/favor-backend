import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateServiceZoneDto } from './dto/create-service-zone.dto';
import { UpdateServiceZoneDto } from './dto/update-service-zone.dto';
import { ServiceZone } from './entity/ServiceZone.entity';

@Injectable()
export class ServiceZonesService {
  constructor(
    @InjectRepository(ServiceZone)
    private repo: Repository<ServiceZone>,
  ) {}

  // =========================
  // CREATE
  // =========================
  async create(dto: CreateServiceZoneDto) {
    // 🔒 Vérifier doublon
    const exists = await this.repo.findOne({
      where: {
        cityId: dto.cityId,
        name: dto.name,
        isActive: true,
      },
    });

    if (exists) {
      throw new ConflictException('Cette zone existe déjà pour cette ville');
    }

    const zone = this.repo.create(dto);
    const saved = await this.repo.save(zone);

    return {
      message: 'Zone créée avec succès',
      data: saved,
    };
  }

  // =========================
  // LIST
  // =========================
  async findAll() {
    const zones = await this.repo.find({
      where: { isActive: true },
    });

    return {
      message: 'Liste des zones',
      data: zones,
    };
  }

  // =========================
  // FIND ONE
  // =========================
  async findOne(id: string) {
    const zone = await this.repo.findOne({ where: { id } });

    if (!zone) {
      throw new NotFoundException('Zone introuvable');
    }

    return {
      message: 'Détails de la zone',
      data: zone,
    };
  }

  // =========================
  // UPDATE
  // =========================
  async update(id: string, dto: UpdateServiceZoneDto) {
    const result = await this.findOne(id);
    const zone = result.data;

    // Vérifier doublon si nom ou ville changé
    if (dto.name || dto.cityId) {
      const exists = await this.repo.findOne({
        where: {
          cityId: dto.cityId ?? zone.cityId,
          name: dto.name ?? zone.name,
          isActive: true,
        },
      });

      if (exists && exists.id !== id) {
        throw new ConflictException(
          'Une zone avec ce nom existe déjà dans cette ville',
        );
      }
    }

    Object.assign(zone, dto);
    const updated = await this.repo.save(zone);

    return {
      message: 'Zone mise à jour avec succès',
      data: updated,
    };
  }

  // =========================
  // DELETE (soft)
  // =========================
  async remove(id: string) {
    const result = await this.findOne(id);
    const zone = result.data;

    zone.isActive = false;
    const deleted = await this.repo.save(zone);

    return {
      message: 'Zone désactivée avec succès',
      data: deleted,
    };
  }

  // =========================
  // Vérifier position
  // =========================
  async findZoneByLocation(lat: number, lng: number) {
    const zones = await this.repo.find({
      where: { isActive: true },
    });

    console.log('Point:', lat, lng);

    for (const zone of zones) {
      console.log('Testing zone:', zone.name);
      console.log('Polygon:', zone.polygon);

      if (this.isPointInPolygon(lat, lng, zone.polygon)) {
        console.log('Zone trouvée:', zone.name);
        return zone;
      }
    }

    console.log('Aucune zone trouvée');
    return null;
  }

  // Ray Casting Algorithm
  private isPointInPolygon(
    lat: number,
    lng: number,
    polygon: { lat: number; lng: number }[],
  ): boolean {
    const x = lng;
    const y = lat;

    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      // ----------- Vérifie si le point est sur le segment -----------
      const onSegment =
        Math.min(xi, xj) <= x &&
        x <= Math.max(xi, xj) &&
        Math.min(yi, yj) <= y &&
        y <= Math.max(yi, yj) &&
        (xj - xi) * (y - yi) === (yj - yi) * (x - xi);

      if (onSegment) return true;
      // ---------------------------------------------------------------

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  }
}
