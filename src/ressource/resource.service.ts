import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from './entity/resource.entity';
import { CreateResourceDto } from './dto/create-resource.dto';

@Injectable()
export class ResourceService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
  ) {}

  // ✅ Créer une ressource
  async create(
    dto: CreateResourceDto,
  ): Promise<{ message: string; data: Resource }> {
    if (!dto.label || !dto.name) {
      throw new BadRequestException('name et label sont requis');
    }

    try {
      // 🔍 Vérifie duplication (name ou label)
      const existing = await this.resourceRepo.findOne({
        where: [{ name: dto.name }, { label: dto.label }],
      });

      if (existing) {
        throw new BadRequestException(
          `Une ressource existe déjà (${existing.name} - ${existing.label})`,
        );
      }

      const resource = this.resourceRepo.create(dto);
      const saved = await this.resourceRepo.save(resource);

      return {
        message: 'Ressource créée avec succès',
        data: saved,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Erreur lors de la création de la ressource',
        error.message,
      );
    }
  }

  // ✅ Lister toutes les ressources
  async findAll(): Promise<{ message: string; data: Resource[] }> {
    try {
      const data = await this.resourceRepo.find({
        where: { deleted: false },
        order: { createdAt: 'DESC' },
      });

      return {
        message: 'Liste des ressources récupérée avec succès',
        data,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Impossible de récupérer les ressources',
        error.message,
      );
    }
  }

  // ✅ Trouver une ressource
  async findOne(id: string) {
    const resource = await this.resourceRepo.findOne({
      where: { id, deleted: false },
    });

    if (!resource) {
      throw new NotFoundException(`Ressource avec ID ${id} introuvable`);
    }

    return {
      message: 'Ressource récupérée avec succès',
      data: resource,
    };
  }

  // ✅ Mettre à jour
  async update(id: string, payload: Partial<Resource>) {
    const resource = await this.resourceRepo.findOne({
      where: { id, deleted: false },
    });

    if (!resource) {
      throw new NotFoundException(`Ressource avec ID ${id} introuvable`);
    }

    // 🔍 Vérifier doublon si name change
    if (payload.name) {
      const existing = await this.resourceRepo.findOne({
        where: { name: payload.name },
      });

      if (existing && existing.id !== id) {
        throw new BadRequestException('Ce name existe déjà');
      }
    }

    Object.assign(resource, payload);
    const updated = await this.resourceRepo.save(resource);

    return {
      message: 'Ressource mise à jour avec succès',
      data: updated,
    };
  }

  // ✅ Soft delete
  async softDelete(id: string) {
    const resource = await this.resourceRepo.findOne({ where: { id } });

    if (!resource) {
      throw new NotFoundException(`Ressource avec ID ${id} introuvable`);
    }

    resource.deleted = true;
    await this.resourceRepo.save(resource);

    return {
      message: `Ressource '${resource.label}' supprimée avec succès`,
      data: resource,
    };
  }
}
