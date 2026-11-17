import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { MediaServiceEntity } from '../entities/media-service.entity';
import { MediaProjectItem } from '../entities/media-project-item.entity';
import {
  CreateMediaServiceDto,
  MediaServiceQueryDto,
  UpdateMediaServiceDto,
} from '../dto/media.dto';
import { MediaServiceCategory, MediaUnit } from '../media.enums';
import { MediaCommonService } from './media-common.service';

/** Catalogue des prestations (l'équipe est gérée par les Ressources humaines) */
@Injectable()
export class MediaCatalogService {
  constructor(private readonly common: MediaCommonService) { }

  private get m() {
    return this.common.dataSource.manager;
  }

  // ============================================================
  // PRESTATIONS
  // ============================================================

  async createService(dto: CreateMediaServiceDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, dto.companyId, lang);
    const dup = await this.m.count(MediaServiceEntity, { where: { companyId, name: dto.name.trim() } });
    if (dup) throw new ConflictException(this.common.t('media.service_exists', lang, { name: dto.name }));
    const service = await this.m.save(
      MediaServiceEntity,
      this.m.create(MediaServiceEntity, {
        ...dto,
        companyId,
        name: dto.name.trim(),
        code: dto.code ? dto.code.toUpperCase() : null,
        category: dto.category ?? MediaServiceCategory.OTHER,
        unit: dto.unit ?? MediaUnit.SESSION,
        currency: dto.currency || 'USD',
        isActive: dto.isActive ?? true,
      }),
    );
    return { message: this.common.t('media.service_created', lang), data: service };
  }

  async listServices(query: MediaServiceQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, query.companyId, lang);
    const qb = this.m.createQueryBuilder(MediaServiceEntity, 's').where('s.companyId = :companyId', { companyId });
    if (query.includeInactive !== 'true') qb.andWhere('s.isActive = 1');
    if (query.category) qb.andWhere('s.category = :category', { category: query.category });
    if (query.search?.trim()) {
      const kw = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(new Brackets((w) => w.where('LOWER(s.name) LIKE :kw', { kw }).orWhere('LOWER(s.description) LIKE :kw', { kw })));
    }
    const data = await qb.orderBy('s.category', 'ASC').addOrderBy('s.name', 'ASC').getMany();
    return { message: this.common.t('media.services', lang), data };
  }

  /** Catalogue public (site / app) : prestations actives d'une entreprise */
  async publicServices(companyId: string, lang: string) {
    const data = await this.m.find(MediaServiceEntity, {
      where: { companyId, isActive: true },
      order: { category: 'ASC', name: 'ASC' },
    });
    return { message: this.common.t('media.services', lang), data };
  }

  private async getService(id: string, user: UserEntity, lang: string) {
    const service = await this.m.findOne(MediaServiceEntity, { where: { id } });
    if (!service) throw new NotFoundException(this.common.t('media.service_not_found', lang));
    await this.common.company(user, service.companyId, lang);
    return service;
  }

  async updateService(id: string, dto: UpdateMediaServiceDto, user: UserEntity, lang: string) {
    const service = await this.getService(id, user, lang);
    const { companyId: _c, ...data } = dto;
    Object.assign(service, data, dto.code ? { code: dto.code.toUpperCase() } : {});
    return { message: this.common.t('media.service_updated', lang), data: await this.m.save(MediaServiceEntity, service) };
  }

  async deleteService(id: string, user: UserEntity, lang: string) {
    const service = await this.getService(id, user, lang);
    const used = await this.m.count(MediaProjectItem, { where: { serviceId: id } });
    if (used) {
      // Déjà utilisée dans des projets : on la désactive au lieu de la supprimer
      service.isActive = false;
      await this.m.save(MediaServiceEntity, service);
      return { message: this.common.t('media.service_deactivated', lang), data: service };
    }
    await this.m.delete(MediaServiceEntity, { id });
    return { message: this.common.t('media.service_deleted', lang), data: { id } };
  }
}
