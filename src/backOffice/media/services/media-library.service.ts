import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { FilesService, UploadedFileDetails } from 'src/files/files.service';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { pageParams } from 'src/backOffice/logistics/common/logistics-access';
import { MediaEventType, MediaFileType, MediaPaymentStatus } from '../media.enums';
import { MediaFile } from '../entities/media-file.entity';
import { MediaProject } from '../entities/media-project.entity';
import { MediaServiceEntity } from '../entities/media-service.entity';
import { CreateMediaFileDto, MediaFileQueryDto, UpdateMediaFileDto } from '../dto/media.dto';
import { MediaCommonService } from './media-common.service';
import { MediaProjectService } from './media-project.service';

/** Taille max d'un fichier média (octets) — MEDIA_MAX_FILE_MB, défaut 500 Mo */
const MAX_BYTES = Number(process.env.MEDIA_MAX_FILE_MB || 500) * 1024 * 1024;

/** Médiathèque : envoi de fichiers / liens, livrables, portfolio public */
@Injectable()
export class MediaLibraryService {
  constructor(
    private readonly common: MediaCommonService,
    private readonly files: FilesService,
    private readonly projects: MediaProjectService,
  ) { }

  private get m() {
    return this.common.dataSource.manager;
  }

  private parseTags(value: any): string[] | null {
    if (value === undefined || value === null || value === '') return null;
    let list: any[] = [];
    if (Array.isArray(value)) list = value;
    else if (typeof value === 'string') {
      const raw = value.trim();
      if (raw.startsWith('[')) {
        try {
          list = JSON.parse(raw);
        } catch {
          list = [];
        }
      } else list = raw.split(',');
    }
    const tags = [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    return tags.length ? tags : null;
  }

  private kindToType(kind: UploadedFileDetails['kind']): MediaFileType {
    if (kind === 'IMAGE') return MediaFileType.PHOTO;
    if (kind === 'VIDEO') return MediaFileType.VIDEO;
    if (kind === 'AUDIO') return MediaFileType.AUDIO;
    return MediaFileType.DOCUMENT;
  }

  private guessLinkType(url: string): MediaFileType {
    const u = url.toLowerCase();
    if (/\.(jpe?g|png|webp|gif|heic)(\?|$)/.test(u)) return MediaFileType.PHOTO;
    if (/\.(mp4|mov|avi|mkv|webm)(\?|$)/.test(u) || /youtube\.com|youtu\.be|vimeo\.com/.test(u)) return MediaFileType.VIDEO;
    return MediaFileType.LINK;
  }

  // ============================================================
  // AJOUT (fichiers envoyés et/ou lien externe)
  // ============================================================

  async add(dto: CreateMediaFileDto, uploaded: Express.Multer.File[], user: UserEntity, lang: string) {
    let companyId: string;
    let project: MediaProject | null = null;
    if (dto.projectId) {
      project = await this.common.getProject(dto.projectId, user, lang);
      companyId = project.companyId;
    } else {
      companyId = await this.common.company(user, dto.companyId, lang);
    }
    if (!uploaded?.length && !dto.url) throw new BadRequestException(this.common.t('media.file_required', lang));

    const tags = this.parseTags(dto.tags);
    const base = {
      companyId,
      projectId: project?.id ?? null,
      sessionId: dto.sessionId ?? null,
      title: dto.title ?? null,
      description: dto.description ?? null,
      isDeliverable: dto.isDeliverable ?? !!project,
      isPortfolio: dto.isPortfolio ?? false,
      tags,
      uploadedById: user?.id ?? null,
    };

    const created: MediaFile[] = [];
    for (const file of uploaded ?? []) {
      if (file.size > MAX_BYTES) {
        throw new BadRequestException(this.common.t('media.file_too_large', lang, { max: Math.round(MAX_BYTES / 1048576) }));
      }
      // Qualité préservée : photos haute définition, vidéos non recompressées
      const info = await this.files.uploadFileDetailed(file, 'media', {
        imageMaxWidth: 4096,
        imageQuality: 92,
        imageMaxSizeKB: 8000,
        imageThumbnail: true,
        compressVideo: false,
        maxSize: MAX_BYTES,
      });
      created.push(
        await this.m.save(
          MediaFile,
          this.m.create(MediaFile, {
            ...base,
            type: this.kindToType(info.kind),
            title: base.title ?? info.originalName,
            url: info.url,
            thumbnailUrl: info.thumbnailUrl,
            mimeType: info.mimeType,
            sizeBytes: info.size,
            width: info.width,
            height: info.height,
            duration: info.duration != null ? Math.round(info.duration) : null,
          }),
        ),
      );
    }
    if (dto.url) {
      created.push(
        await this.m.save(
          MediaFile,
          this.m.create(MediaFile, { ...base, type: dto.type ?? this.guessLinkType(dto.url), url: dto.url }),
        ),
      );
    }

    if (project) {
      await this.common.record(project.id, MediaEventType.FILE_ADDED, `${created.length} fichier(s) ajouté(s) à la médiathèque`, user, {
        payload: { files: created.map((f) => f.id) },
      });
    }
    return { message: this.common.t('media.files_added', lang, { count: created.length }), data: created };
  }

  async update(id: string, dto: UpdateMediaFileDto, user: UserEntity, lang: string) {
    const file = await this.m.findOne(MediaFile, { where: { id } });
    if (!file) throw new NotFoundException(this.common.t('media.file_not_found', lang));
    await this.common.company(user, file.companyId, lang);
    if (dto.projectId && dto.projectId !== file.projectId) {
      const p = await this.common.getProject(dto.projectId, user, lang);
      if (p.companyId !== file.companyId) throw new BadRequestException(this.common.t('media.forbidden', lang));
    }
    const { tags, ...rest } = dto;
    Object.assign(file, rest);
    if (tags !== undefined) file.tags = this.parseTags(tags);
    return { message: this.common.t('media.file_updated', lang), data: await this.m.save(MediaFile, file) };
  }

  async remove(id: string, user: UserEntity, lang: string) {
    const file = await this.m.findOne(MediaFile, { where: { id } });
    if (!file) throw new NotFoundException(this.common.t('media.file_not_found', lang));
    await this.common.company(user, file.companyId, lang);
    await this.m.delete(MediaFile, { id });
    if (file.type !== MediaFileType.LINK) {
      void this.files.deleteFileByUrl(file.url).catch(() => undefined);
      if (file.thumbnailUrl) void this.files.deleteFileByUrl(file.thumbnailUrl).catch(() => undefined);
    }
    return { message: this.common.t('media.file_deleted', lang), data: { id } };
  }

  async list(query: MediaFileQueryDto, user: UserEntity, lang: string) {
    const companyId = query.projectId
      ? (await this.common.getProject(query.projectId, user, lang)).companyId
      : await this.common.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.m
      .createQueryBuilder(MediaFile, 'f')
      .leftJoin('f.project', 'project')
      .addSelect(['project.id', 'project.reference', 'project.title'])
      .where('f.companyId = :companyId', { companyId });
    if (query.projectId) qb.andWhere('f.projectId = :projectId', { projectId: query.projectId });
    if (query.type) qb.andWhere('f.type = :type', { type: query.type });
    if (query.isDeliverable) qb.andWhere('f.isDeliverable = :d', { d: query.isDeliverable === 'true' ? 1 : 0 });
    if (query.isPortfolio) qb.andWhere('f.isPortfolio = :pf', { pf: query.isPortfolio === 'true' ? 1 : 0 });
    if (query.tag) qb.andWhere('JSON_CONTAINS(f.tags, JSON_QUOTE(:tag))', { tag: query.tag.trim().toLowerCase() });
    if (query.search?.trim()) {
      const kw = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(new Brackets((w) => w.where('LOWER(f.title) LIKE :kw', { kw }).orWhere('LOWER(f.description) LIKE :kw', { kw })));
    }
    const [items, total] = await qb.orderBy('f.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    return { message: this.common.t('media.files', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  // ============================================================
  // PUBLIC (sans connexion)
  // ============================================================

  /** Portfolio public d'une entreprise : réalisations + prestations */
  async portfolio(companyId: string, lang: string, page?: number, limit?: number, tag?: string, type?: string) {
    const company = await this.m.findOne(CompanyEntity, { where: { id: companyId } });
    if (!company) throw new NotFoundException(this.common.t('media.company_not_found', lang));
    const p = pageParams(page, limit);
    const qb = this.m
      .createQueryBuilder(MediaFile, 'f')
      .select(['f.id', 'f.type', 'f.title', 'f.description', 'f.url', 'f.thumbnailUrl', 'f.width', 'f.height', 'f.duration', 'f.tags', 'f.createdAt'])
      .where('f.companyId = :companyId', { companyId })
      .andWhere('f.isPortfolio = 1');
    if (tag) qb.andWhere('JSON_CONTAINS(f.tags, JSON_QUOTE(:tag))', { tag: tag.trim().toLowerCase() });
    if (type) qb.andWhere('f.type = :type', { type });
    const [items, total] = await qb.orderBy('f.createdAt', 'DESC').skip(p.skip).take(p.limit).getManyAndCount();
    const services = await this.m.find(MediaServiceEntity, {
      where: { companyId, isActive: true },
      select: ['id', 'name', 'category', 'description', 'unit', 'unitPrice', 'currency', 'deliverables', 'imageUrl'],
      order: { category: 'ASC', name: 'ASC' },
    });
    return {
      message: this.common.t('media.portfolio', lang),
      data: {
        company: { id: company.id, name: company.companyName, logo: company.logo, phone: company.phone, email: company.email, website: company.website },
        services,
        files: new PaginatedResponseDto(items, total, p.page, p.limit),
      },
    };
  }

  /**
   * Galerie de livraison du client (lien privé).
   * MEDIA_DELIVERY_REQUIRE_PAID=true : les fichiers ne sont visibles qu'une fois le projet payé.
   */
  async delivery(token: string, lang: string) {
    const project = await this.projects.findByDeliveryToken(token);
    if (!project) throw new NotFoundException(this.common.t('media.delivery_link_invalid', lang));
    const requirePaid = String(process.env.MEDIA_DELIVERY_REQUIRE_PAID || 'false').toLowerCase() === 'true';
    const locked =
      requirePaid &&
      ![MediaPaymentStatus.PAID, MediaPaymentStatus.NOT_APPLICABLE].includes(project.paymentStatus);
    const files = locked
      ? []
      : await this.m.find(MediaFile, {
        where: { projectId: project.id, isDeliverable: true },
        select: ['id', 'type', 'title', 'description', 'url', 'thumbnailUrl', 'mimeType', 'sizeBytes', 'width', 'height', 'duration', 'createdAt'],
        order: { createdAt: 'ASC' },
      });
    const company = await this.m.findOne(CompanyEntity, { where: { id: project.companyId } });
    return {
      message: this.common.t(locked ? 'media.delivery_locked' : 'media.delivery', lang),
      data: {
        project: {
          reference: project.reference,
          title: project.title,
          eventDate: project.eventDate,
          clientName: project.clientName,
          status: project.status,
          total: project.total,
          amountPaid: project.amountPaid,
          balance: Math.round((project.total - project.amountPaid) * 100) / 100,
          currency: project.currency,
          paymentStatus: project.paymentStatus,
          expiresAt: project.deliveryTokenExpiresAt,
        },
        company: company ? { name: company.companyName, logo: company.logo, phone: company.phone, email: company.email } : null,
        locked,
        files,
      },
    };
  }
}
