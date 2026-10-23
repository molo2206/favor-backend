import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { MediaServiceEntity } from '../entities/media-service.entity';
import { MediaTeamMember } from '../entities/media-team-member.entity';
import { MediaProjectItem } from '../entities/media-project-item.entity';
import {
  CreateMediaServiceDto,
  CreateTeamMemberDto,
  MediaServiceQueryDto,
  UpdateMediaServiceDto,
  UpdateTeamMemberDto,
} from '../dto/media.dto';
import { MediaServiceCategory, MediaUnit } from '../media.enums';
import { MediaCommonService } from './media-common.service';

/** Catalogue des prestations + équipe média */
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

  // ============================================================
  // ÉQUIPE
  // ============================================================

  async addMember(dto: CreateTeamMemberDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, dto.companyId, lang);
    const target = await this.m.findOne(UserEntity, { where: { id: dto.userId } });
    if (!target) throw new NotFoundException(this.common.t('media.user_not_found', lang));
    if (!(await this.common.isMember(dto.userId, companyId))) {
      throw new BadRequestException(this.common.t('media.user_not_in_company', lang));
    }
    const dup = await this.m.count(MediaTeamMember, { where: { companyId, userId: dto.userId } });
    if (dup) throw new ConflictException(this.common.t('media.member_exists', lang));
    const member = await this.m.save(
      MediaTeamMember,
      this.m.create(MediaTeamMember, { ...dto, companyId, isActive: dto.isActive ?? true }),
    );
    return { message: this.common.t('media.member_added', lang), data: member };
  }

  async listMembers(user: UserEntity, lang: string, companyIdParam?: string, role?: string) {
    const companyId = await this.common.company(user, companyIdParam, lang);
    const rows = await this.m.find(MediaTeamMember, {
      where: { companyId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
    const data = rows
      .filter((r) => !role || (r.roles ?? []).includes(role))
      .map((r) => ({
        ...r,
        user: r.user ? { id: r.user.id, fullName: r.user.fullName, phone: r.user.phone, email: r.user.email, image: r.user.image } : null,
      }));
    return { message: this.common.t('media.team', lang), data };
  }

  async updateMember(id: string, dto: UpdateTeamMemberDto, user: UserEntity, lang: string) {
    const member = await this.m.findOne(MediaTeamMember, { where: { id } });
    if (!member) throw new NotFoundException(this.common.t('media.member_not_found', lang));
    await this.common.company(user, member.companyId, lang);
    Object.assign(member, dto);
    return { message: this.common.t('media.member_updated', lang), data: await this.m.save(MediaTeamMember, member) };
  }

  async removeMember(id: string, user: UserEntity, lang: string) {
    const member = await this.m.findOne(MediaTeamMember, { where: { id } });
    if (!member) throw new NotFoundException(this.common.t('media.member_not_found', lang));
    await this.common.company(user, member.companyId, lang);
    await this.m.delete(MediaTeamMember, { id });
    return { message: this.common.t('media.member_removed', lang), data: { id } };
  }
}
