import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Resource } from './entity/resource.entity';
import { CreateResourceDto } from './dto/create-resource.dto';

@Injectable()
export class ResourceService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
  ) {}

  //  Créer une ressource
  async create(dto: CreateResourceDto): Promise<{ message: string; data: Resource }> {
    if (!dto.label || !dto.value) {
      throw new BadRequestException('label, value sont requis');
    }

    try {
      // 🔍 Vérifie si une ressource avec le même label ou value existe déjà
      const existing = await this.resourceRepo.findOne({
        where: [{ label: dto.label }, { value: dto.value }],
      });

      if (existing) {
        throw new BadRequestException(
          `Une ressource avec ce label ou cette valeur existe déjà (${existing.label} - ${existing.value})`,
        );
      }

      const resource = this.resourceRepo.create(dto);
      const saved = await this.resourceRepo.save(resource);

      return {
        message: 'Ressource créée avec succès',
        data: saved,
      };
    } catch (error) {
      // ⚙️ Si c’est déjà une erreur connue (BadRequest, NotFound, etc.), on la relance telle quelle
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Sinon, c’est bien une erreur serveur inattendue
      throw new InternalServerErrorException(
        'Erreur lors de la création de la ressource',
        error.message,
      );
    }
  }

  //  Lister toutes les ressources (option recherche)
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

  // ✅ Mettre à jour une ressource
  async update(id: string, payload: Partial<Resource>) {
    const resource = await this.resourceRepo.findOne({ where: { id, deleted: false } });
    if (!resource) {
      throw new NotFoundException(`Ressource avec ID ${id} introuvable`);
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
      message: `Ressource '${resource.label}' supprimée avec succès (soft delete)`,
      data: resource,
    };
  }
}
