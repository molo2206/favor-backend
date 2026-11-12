import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { FilesService } from 'src/files/files.service';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { pageParams } from 'src/backOffice/logistics/common/logistics-access';
import { buildXlsx, h, htmlToPdf } from 'src/backOffice/needs/common/needs-export';
import { NotificationType } from 'src/notification/type/notification.type';
import {
  MEDIA_VENDOR_BUSY,
  MEDIA_VENDOR_TRANSITIONS,
  MediaCrewRole,
  MediaEventType,
  MediaPaymentMethod,
  MediaPaymentStatus,
  MediaProjectStatus,
  MediaUnit,
  MediaVendorAssignmentStatus,
  MediaVendorDocumentType,
  MediaVendorDomain,
  MediaVendorStatus,
  MediaVendorType,
} from '../media.enums';
import { MediaVendorRate } from '../entities/media-vendor-rate.entity';
import { MediaVendorRateService } from './media-vendor-rate.service';
import { MediaProject } from '../entities/media-project.entity';
import { MediaSession } from '../entities/media-session.entity';
import { MediaVendor, MediaVendorDocument } from '../entities/media-vendor.entity';
import { MediaVendorAssignment, MediaVendorPayment } from '../entities/media-vendor-assignment.entity';
import {
  AddVendorPaymentDto,
  ChangeVendorStatusDto,
  CreateMediaVendorDto,
  CreateVendorAssignmentDto,
  CreateVendorDocumentDto,
  MediaVendorQueryDto,
  ToggleVendorDto,
  UpdateMediaVendorDto,
  UpdateVendorAssignmentDto,
  VendorAssignmentQueryDto,
  VendorAssignmentStatusDto,
  VendorAvailabilityQueryDto,
  VendorStatementQueryDto,
} from '../dto/vendor.dto';
import { MediaCommonService } from './media-common.service';

const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;
const EPS = 0.005;
const MAX_DOC_BYTES = Number(process.env.MEDIA_VENDOR_DOC_MAX_MB || 20) * 1024 * 1024;
const MAX_PHOTO_BYTES = Number(process.env.MEDIA_VENDOR_PHOTO_MAX_MB || 5) * 1024 * 1024;
/** Statuts qui interdisent d'engager le prestataire */
const BLOCKED = [MediaVendorStatus.SUSPENDED, MediaVendorStatus.BLACKLISTED, MediaVendorStatus.ARCHIVED];
const CLOSED_PROJECT = [MediaProjectStatus.COMPLETED, MediaProjectStatus.CANCELLED];

function list(v?: string): string[] {
  return String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function parseDate(v?: string | null, endOfDay = false): Date | null {
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}` : v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * ✅ PRESTATAIRES EXTERNES DU SERVICE MÉDIA
 *  - Référentiel : coordonnées, compétences, tarifs, moyens de paiement, contrat / NDA, statut (prospect → actif → suspendu / liste noire)
 *  - Dossier : pièces avec date d'expiration (alertes)
 *  - Missions sur les projets / séances : contrôle des chevauchements, cycle proposé → confirmé → en cours → rendu → validé
 *  - Évaluation (qualité, ponctualité, communication) → note moyenne du prestataire
 *  - Paiements (acomptes / soldes), dettes fournisseurs, relevé exportable (Excel / PDF), coût et marge par projet
 */
@Injectable()
export class MediaVendorService {
  constructor(
    private readonly common: MediaCommonService,
    private readonly files: FilesService,
    private readonly rates: MediaVendorRateService,
  ) { }

  /** Libellés traduits des domaines d'un prestataire */
  private withDomainLabels<T extends { domains?: MediaVendorDomain[] | null }>(v: T, lang: string) {
    return { ...v, domainLabels: (v.domains ?? []).map((d) => this.rates.domainLabel(d, lang)) };
  }

  private get m() {
    return this.common.dataSource.manager;
  }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.common.t(key, lang, params);
  }

  private fmt(d?: Date | string | null) {
    return d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '';
  }

  private payStatus(amount: number, paid: number): MediaPaymentStatus {
    if (amount <= 0) return paid > 0 ? MediaPaymentStatus.PAID : MediaPaymentStatus.NOT_APPLICABLE;
    if (paid >= amount - EPS) return MediaPaymentStatus.PAID;
    return paid > 0 ? MediaPaymentStatus.PARTIAL : MediaPaymentStatus.UNPAID;
  }

  // ============================================================
  // RÉFÉRENTIEL
  // ============================================================
  private async getVendor(id: string, user: UserEntity, lang: string, m?: EntityManager) {
    const vendor = await (m ?? this.m).findOne(MediaVendor, { where: { id } });
    if (!vendor) throw new NotFoundException(this.t('media.vendor.not_found', lang));
    await this.common.company(user, vendor.companyId, lang);
    return vendor;
  }

  private async nextCode(companyId: string): Promise<string> {
    const rows = await this.m.query(
      "SELECT MAX(CAST(SUBSTRING(`code`, 5) AS UNSIGNED)) AS n FROM `bo_media_vendors` WHERE `companyId` = ? AND `code` LIKE 'PRS-%'",
      [companyId],
    );
    const n = Number(rows?.[0]?.n || 0) + 1;
    return `PRS-${String(n).padStart(4, '0')}`;
  }

  private async assertUnique(companyId: string, dto: { name?: string; phone?: string | null; email?: string | null }, lang: string, excludeId?: string) {
    const qb = this.m.createQueryBuilder(MediaVendor, 'v').where('v.companyId = :companyId', { companyId });
    if (excludeId) qb.andWhere('v.id != :excludeId', { excludeId });
    const conds: string[] = [];
    const params: Record<string, any> = {};
    if (dto.name) {
      conds.push('LOWER(v.name) = :name');
      params.name = dto.name.trim().toLowerCase();
    }
    if (dto.phone) {
      conds.push('v.phone = :phone');
      params.phone = dto.phone.trim();
    }
    if (dto.email) {
      conds.push('LOWER(v.email) = :email');
      params.email = dto.email.trim().toLowerCase();
    }
    if (!conds.length) return;
    const dup = await qb.andWhere(`(${conds.join(' OR ')})`, params).getOne();
    if (dup) throw new ConflictException(this.t('media.vendor.exists', lang, { name: dup.name, code: dup.code }));
  }

  private async assertUser(userId: string | undefined | null, lang: string) {
    if (!userId) return;
    const exists = await this.m.count(UserEntity, { where: { id: userId } });
    if (!exists) throw new NotFoundException(this.t('media.vendor.user_not_found', lang));
  }

  private assertContract(start?: string | null, end?: string | null, lang = 'fr') {
    if (start && end && new Date(end) < new Date(start)) throw new BadRequestException(this.t('media.vendor.contract_dates', lang));
  }

  /** ✅ Photo : image uniquement (JPEG, PNG, WEBP, HEIC…), redimensionnée, MEDIA_VENDOR_PHOTO_MAX_MB (5 Mo par défaut) */
  private async uploadPhoto(file: Express.Multer.File, lang: string): Promise<string> {
    if (!String(file.mimetype || '').startsWith('image/')) {
      throw new BadRequestException(this.t('media.vendor.photo_invalid', lang));
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new BadRequestException(this.t('media.file_too_large', lang, { max: Math.round(MAX_PHOTO_BYTES / 1048576) }));
    }
    return this.files.uploadImageUrl(file, 'media/vendors/photos', 800);
  }

  async create(dto: CreateMediaVendorDto, user: UserEntity, lang: string, photo?: Express.Multer.File) {
    const companyId = await this.common.company(user, dto.companyId, lang);
    await this.assertUnique(companyId, dto, lang);
    await this.assertUser(dto.userId, lang);
    this.assertContract(dto.contractStartDate, dto.contractEndDate, lang);
    const { companyId: _c, rates: rateDtos, removePhoto: _rp, ...data } = dto;
    const photoUrl = photo ? await this.uploadPhoto(photo, lang) : null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // ✅ Fiche + prestations enregistrées ensemble (tout ou rien)
        const { vendor, rates } = await this.common.dataSource.transaction(async (m) => {
          const vendor = await m.save(
            MediaVendor,
            m.create(MediaVendor, {
              ...data,
              companyId,
              code: await this.nextCode(companyId),
              name: dto.name.trim(),
              email: dto.email?.trim().toLowerCase() ?? null,
              phone: dto.phone?.trim() ?? null,
              domainOther: dto.domainOther?.trim() || null,
              photoUrl,
              type: dto.type ?? MediaVendorType.INDIVIDUAL,
              currency: (dto.currency || 'USD').toUpperCase(),
              ndaSigned: dto.ndaSigned ?? false,
              status: dto.status ?? MediaVendorStatus.ACTIVE,
              statusChangedAt: new Date(),
              createdById: user?.id ?? null,
            }),
          );
          const rates = rateDtos?.length ? await this.rates.insertMany(m, vendor, rateDtos, user, lang) : [];
          // ✅ Pas de tarif de base saisi : le premier prix de la liste devient le tarif de base
          if (rates.length && (vendor.rateAmount === null || vendor.rateAmount === undefined)) {
            vendor.rateAmount = rates[0].price;
            vendor.rateUnit = rates[0].unit;
            await m.save(MediaVendor, vendor);
          }
          return { vendor, rates };
        });
        return {
          message: this.t('media.vendor.created', lang),
          data: { ...this.withDomainLabels(vendor, lang), rates: rates.map((r) => this.rates.view(r, lang)) },
        };
      } catch (e: any) {
        // Code déjà pris par une création simultanée : on recalcule
        if (e?.code === 'ER_DUP_ENTRY' && attempt < 2) continue;
        if (photoUrl) void this.files.deleteFileByUrl(photoUrl).catch(() => undefined);
        throw e;
      }
    }
  }

  /** Soldes (dû − payé) par prestataire et par devise */
  private async balances(vendorIds: string[]): Promise<Map<string, { currency: string; agreed: number; paid: number; balance: number }[]>> {
    const map = new Map<string, { currency: string; agreed: number; paid: number; balance: number }[]>();
    if (!vendorIds.length) return map;
    const rows = await this.m
      .createQueryBuilder(MediaVendorAssignment, 'a')
      .select('a.vendorId', 'vendorId')
      .addSelect('a.currency', 'currency')
      .addSelect('COALESCE(SUM(a.amount), 0)', 'agreed')
      .addSelect('COALESCE(SUM(a.amountPaid), 0)', 'paid')
      .where('a.vendorId IN (:...ids)', { ids: vendorIds })
      .andWhere('a.status != :cancelled', { cancelled: MediaVendorAssignmentStatus.CANCELLED })
      .groupBy('a.vendorId')
      .addGroupBy('a.currency')
      .getRawMany();
    for (const r of rows) {
      const agreed = round2(Number(r.agreed));
      const paid = round2(Number(r.paid));
      const arr = map.get(r.vendorId) ?? [];
      arr.push({ currency: r.currency, agreed, paid, balance: round2(agreed - paid) });
      map.set(r.vendorId, arr);
    }
    return map;
  }

  async list(q: MediaVendorQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, q.companyId, lang);
    const { page, limit, skip } = pageParams(q.page, q.limit);
    const qb = this.m.createQueryBuilder(MediaVendor, 'v').where('v.companyId = :companyId', { companyId });

    const statuses = list(q.status).map((s) => s.toUpperCase());
    if (statuses.length) qb.andWhere('v.status IN (:...statuses)', { statuses });
    else qb.andWhere('v.status != :archived', { archived: MediaVendorStatus.ARCHIVED });
    if (q.type) qb.andWhere('v.type = :type', { type: q.type });
    if (q.category) qb.andWhere('JSON_CONTAINS(v.categories, JSON_QUOTE(:category))', { category: q.category });
    // ✅ Domaine d'intervention (un ou plusieurs)
    const domains = list(q.domain).map((d) => d.toUpperCase()).filter((d) => (Object.values(MediaVendorDomain) as string[]).includes(d));
    if (domains.length) {
      qb.andWhere(
        new Brackets((b) => domains.forEach((d, i) => b.orWhere(`JSON_CONTAINS(v.domains, JSON_QUOTE(:dom${i}))`, { [`dom${i}`]: d }))),
      );
    }
    if (q.currency?.trim()) {
      qb.andWhere('EXISTS (SELECT 1 FROM bo_media_vendor_rates rc WHERE rc.vendorId = v.id AND rc.isActive = 1 AND rc.currency = :rcur)', {
        rcur: q.currency.trim().toUpperCase(),
      });
    }
    if (q.hasRates === 'true') qb.andWhere('EXISTS (SELECT 1 FROM bo_media_vendor_rates rh WHERE rh.vendorId = v.id AND rh.isActive = 1)');
    if (q.hasRates === 'false') qb.andWhere('NOT EXISTS (SELECT 1 FROM bo_media_vendor_rates rh WHERE rh.vendorId = v.id AND rh.isActive = 1)');
    if (q.role) qb.andWhere('JSON_CONTAINS(v.roles, JSON_QUOTE(:role))', { role: q.role });
    if (q.city?.trim()) qb.andWhere('LOWER(v.city) LIKE :city', { city: `%${q.city.trim().toLowerCase()}%` });
    if (q.minRating !== undefined) qb.andWhere('v.rating >= :minRating', { minRating: q.minRating });
    if (q.withBalance === 'true') {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM bo_media_vendor_assignments a WHERE a.vendorId = v.id AND a.status != :cancelledA AND a.amount - a.amountPaid > 0.005)',
        { cancelledA: MediaVendorAssignmentStatus.CANCELLED },
      );
    }
    if (q.search?.trim()) {
      const kw = `%${q.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('LOWER(v.name) LIKE :kw', { kw })
            .orWhere('LOWER(v.code) LIKE :kw', { kw })
            .orWhere('LOWER(v.legalName) LIKE :kw', { kw })
            .orWhere('LOWER(v.contactName) LIKE :kw', { kw })
            .orWhere('v.phone LIKE :kw', { kw })
            .orWhere('LOWER(v.email) LIKE :kw', { kw })
            .orWhere('LOWER(v.specialties) LIKE :kw', { kw })
            .orWhere('LOWER(v.domainOther) LIKE :kw', { kw })
            .orWhere('EXISTS (SELECT 1 FROM bo_media_vendor_rates rs WHERE rs.vendorId = v.id AND LOWER(rs.name) LIKE :kw)', { kw }),
        ),
      );
    }
    const sortCol = { name: 'v.name', rating: 'v.rating', createdAt: 'v.createdAt', code: 'v.code' }[q.sortBy ?? 'name'] ?? 'v.name';
    const order = String(q.sortOrder ?? (q.sortBy === 'rating' || q.sortBy === 'createdAt' ? 'DESC' : 'ASC')).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const [rows, total] = await qb.orderBy(sortCol, order).addOrderBy('v.id', 'ASC').skip(skip).take(limit).getManyAndCount();

    const ids = rows.map((r) => r.id);
    const [bal, rateMap, rateCounts] = await Promise.all([
      this.balances(ids),
      q.withRates === 'true' ? this.rates.ratesOf(ids) : Promise.resolve(new Map<string, MediaVendorRate[]>()),
      this.rateCounts(ids),
    ]);
    const data = rows.map((v) => ({
      ...this.withDomainLabels(v, lang),
      balances: bal.get(v.id) ?? [],
      ratesCount: rateCounts.get(v.id) ?? 0,
      ...(q.withRates === 'true' ? { rates: (rateMap.get(v.id) ?? []).map((r) => this.rates.view(r, lang)) } : {}),
    }));
    return { message: this.t('media.vendor.list', lang), data: new PaginatedResponseDto<any>(data, total, page, limit) };
  }

  /** Nombre de prestations actives par prestataire */
  private async rateCounts(ids: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!ids.length) return map;
    const rows = await this.m
      .createQueryBuilder(MediaVendorRate, 'r')
      .select('r.vendorId', 'vendorId')
      .addSelect('COUNT(*)', 'n')
      .where('r.vendorId IN (:...ids)', { ids })
      .andWhere('r.isActive = 1')
      .groupBy('r.vendorId')
      .getRawMany();
    for (const r of rows) map.set(r.vendorId, Number(r.n));
    return map;
  }

  async findOne(id: string, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(id, user, lang);
    const [documents, byStatus, bal, recent, upcoming, payments, rateMap] = await Promise.all([
      this.m.find(MediaVendorDocument, { where: { vendorId: id }, order: { createdAt: 'DESC' } }),
      this.m
        .createQueryBuilder(MediaVendorAssignment, 'a')
        .select('a.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('a.vendorId = :id', { id })
        .groupBy('a.status')
        .getRawMany(),
      this.balances([id]),
      this.m.find(MediaVendorAssignment, { where: { vendorId: id }, relations: ['project', 'session'], order: { createdAt: 'DESC' }, take: 10 }),
      this.m
        .createQueryBuilder(MediaVendorAssignment, 'a')
        .leftJoinAndSelect('a.project', 'p')
        .leftJoinAndSelect('a.session', 's')
        .where('a.vendorId = :id', { id })
        .andWhere('a.status IN (:...busy)', { busy: MEDIA_VENDOR_BUSY })
        .andWhere('(a.startAt >= :now OR a.dueAt >= :now)', { now: new Date() })
        .orderBy('a.startAt', 'ASC')
        .take(10)
        .getMany(),
      this.m.find(MediaVendorPayment, { where: { vendorId: id }, order: { paidAt: 'DESC' }, take: 10 }),
      this.rates.ratesOf([id], true),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const docs = documents.map((d) => ({ ...d, expired: !!d.expiresAt && String(d.expiresAt).slice(0, 10) < today }));
    const missing = [MediaVendorDocumentType.CONTRACT, MediaVendorDocumentType.ID_CARD].filter(
      (t) => !documents.some((d) => d.type === t),
    );
    return {
      message: this.t('media.vendor.detail', lang),
      data: {
        ...this.withDomainLabels(vendor, lang),
        // ✅ Prestations et tarifs (actives d'abord)
        rates: (rateMap.get(id) ?? [])
          .sort((a, b) => Number(b.isActive) - Number(a.isActive))
          .map((r) => this.rates.view(r, lang)),
        documents: docs,
        missingDocuments: missing,
        stats: {
          missionsByStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
          balances: bal.get(id) ?? [],
        },
        upcoming: upcoming.map((a) => this.summary(a)),
        recentMissions: recent.map((a) => this.summary(a)),
        recentPayments: payments,
      },
    };
  }

  private summary(a: MediaVendorAssignment) {
    return {
      id: a.id,
      status: a.status,
      role: a.role,
      startAt: a.startAt,
      endAt: a.endAt,
      dueAt: a.dueAt,
      amount: a.amount,
      amountPaid: a.amountPaid,
      balance: round2(a.amount - a.amountPaid),
      currency: a.currency,
      paymentStatus: a.paymentStatus,
      rating: a.rating,
      project: a.project ? { id: a.project.id, reference: a.project.reference, title: a.project.title } : null,
      session: a.session ? { id: a.session.id, title: a.session.title, startAt: a.session.startAt } : null,
    };
  }

  async update(id: string, dto: UpdateMediaVendorDto, user: UserEntity, lang: string, photo?: Express.Multer.File) {
    const vendor = await this.getVendor(id, user, lang);
    await this.assertUnique(
      vendor.companyId,
      { name: dto.name, phone: dto.phone, email: dto.email },
      lang,
      vendor.id,
    );
    if (dto.userId !== undefined) await this.assertUser(dto.userId, lang);
    this.assertContract(dto.contractStartDate ?? vendor.contractStartDate, dto.contractEndDate ?? vendor.contractEndDate, lang);
    // ✅ « rates » envoyé avec la fiche : la grille de prix est remplacée (voir syncForVendor)
    const { companyId: _c, status: _s, rates: rateDtos, removePhoto, ...data } = dto;
    Object.assign(vendor, data);
    // ✅ Photo : remplacement ou suppression (l'ancien fichier est effacé)
    const oldPhoto = vendor.photoUrl ?? null;
    if (photo) vendor.photoUrl = await this.uploadPhoto(photo, lang);
    else if (removePhoto) vendor.photoUrl = null;
    if (dto.domainOther !== undefined) vendor.domainOther = dto.domainOther?.trim() || null;
    if (dto.name) vendor.name = dto.name.trim();
    if (dto.email !== undefined) vendor.email = dto.email?.trim().toLowerCase() || null;
    if (dto.currency) vendor.currency = dto.currency.toUpperCase();
    let rates: MediaVendorRate[] | null = null;
    const saved = await this.common.dataSource.transaction(async (m) => {
      const v = await m.save(MediaVendor, vendor);
      if (rateDtos !== undefined) {
        rates = await this.rates.syncForVendor(m, v, rateDtos ?? [], user, lang);
        const first = (rates as MediaVendorRate[])[0];
        if (first && dto.rateAmount === undefined && (v.rateAmount === null || v.rateAmount === undefined)) {
          v.rateAmount = first.price;
          v.rateUnit = first.unit;
          await m.save(MediaVendor, v);
        }
      }
      return v;
    });
    if (oldPhoto && oldPhoto !== saved.photoUrl) void this.files.deleteFileByUrl(oldPhoto).catch(() => undefined);
    return {
      message: this.t('media.vendor.updated', lang),
      data: {
        ...this.withDomainLabels(saved, lang),
        ...(rates ? { rates: (rates as MediaVendorRate[]).map((r) => this.rates.view(r, lang)) } : {}),
      },
    };
  }

  /** ✅ Changer uniquement la photo */
  async setPhoto(id: string, file: Express.Multer.File | undefined, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(id, user, lang);
    if (!file) throw new BadRequestException(this.t('media.file_required', lang));
    const oldPhoto = vendor.photoUrl ?? null;
    vendor.photoUrl = await this.uploadPhoto(file, lang);
    const saved = await this.m.save(MediaVendor, vendor);
    if (oldPhoto) void this.files.deleteFileByUrl(oldPhoto).catch(() => undefined);
    return { message: this.t('media.vendor.photo_updated', lang), data: { id: saved.id, photoUrl: saved.photoUrl } };
  }

  async removePhoto(id: string, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(id, user, lang);
    const oldPhoto = vendor.photoUrl ?? null;
    vendor.photoUrl = null;
    await this.m.save(MediaVendor, vendor);
    if (oldPhoto) void this.files.deleteFileByUrl(oldPhoto).catch(() => undefined);
    return { message: this.t('media.vendor.photo_deleted', lang), data: { id: vendor.id, photoUrl: null } };
  }

  async changeStatus(id: string, dto: ChangeVendorStatusDto, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(id, user, lang);
    if ([MediaVendorStatus.SUSPENDED, MediaVendorStatus.BLACKLISTED].includes(dto.status) && !dto.reason?.trim()) {
      throw new BadRequestException(this.t('media.vendor.reason_required', lang));
    }
    vendor.status = dto.status;
    vendor.statusReason = dto.reason?.trim() || null;
    vendor.statusChangedAt = new Date();
    await this.m.save(MediaVendor, vendor);
    // Missions encore ouvertes : à réaffecter si le prestataire est écarté
    const openMissions = BLOCKED.includes(dto.status)
      ? await this.m.count(MediaVendorAssignment, { where: { vendorId: id, status: In(MEDIA_VENDOR_BUSY) } })
      : 0;
    return {
      message: openMissions
        ? this.t('media.vendor.status_changed_open', lang, { count: openMissions })
        : this.t('media.vendor.status_changed', lang),
      data: { ...vendor, openMissions },
    };
  }

  /** ✅ Activer / désactiver simplement (désactivé = SUSPENDED, motif facultatif) */
  async toggle(id: string, dto: ToggleVendorDto, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(id, user, lang);
    if (dto.active && vendor.status === MediaVendorStatus.BLACKLISTED) {
      throw new BadRequestException(this.t('media.vendor.blacklisted_reactivate', lang));
    }
    return this.changeStatus(
      id,
      {
        status: dto.active ? MediaVendorStatus.ACTIVE : MediaVendorStatus.SUSPENDED,
        reason: dto.active ? dto.reason : dto.reason?.trim() || this.t('media.vendor.disabled_reason', lang),
      },
      user,
      lang,
    );
  }

  async remove(id: string, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(id, user, lang);
    const used = await this.m.count(MediaVendorAssignment, { where: { vendorId: id } });
    if (used) {
      // Historique conservé : on archive au lieu de supprimer
      vendor.status = MediaVendorStatus.ARCHIVED;
      vendor.statusChangedAt = new Date();
      await this.m.save(MediaVendor, vendor);
      return { message: this.t('media.vendor.archived', lang), data: vendor };
    }
    await this.m.delete(MediaVendor, { id });
    if (vendor.photoUrl) void this.files.deleteFileByUrl(vendor.photoUrl).catch(() => undefined);
    return { message: this.t('media.vendor.deleted', lang), data: { id } };
  }

  // ============================================================
  // DOSSIER
  // ============================================================
  async addDocument(id: string, dto: CreateVendorDocumentDto, file: Express.Multer.File | undefined, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(id, user, lang);
    if (!file && !dto.url) throw new BadRequestException(this.t('media.file_required', lang));
    let url = dto.url ?? '';
    let mimeType: string | null = null;
    let sizeBytes: number | null = null;
    let title = dto.title?.trim() || '';
    if (file) {
      if (file.size > MAX_DOC_BYTES) {
        throw new BadRequestException(this.t('media.file_too_large', lang, { max: Math.round(MAX_DOC_BYTES / 1048576) }));
      }
      const info = await this.files.uploadFileDetailed(file, 'media/vendors', { imageMaxWidth: 2400, imageQuality: 88, compressVideo: false, maxSize: MAX_DOC_BYTES });
      url = info.url;
      mimeType = info.mimeType;
      sizeBytes = info.size;
      title = title || info.originalName;
    }
    const doc = await this.m.save(
      MediaVendorDocument,
      this.m.create(MediaVendorDocument, {
        companyId: vendor.companyId,
        vendorId: vendor.id,
        type: dto.type ?? MediaVendorDocumentType.OTHER,
        title: (title || dto.type || 'Document').slice(0, 200),
        url,
        mimeType,
        sizeBytes,
        expiresAt: dto.expiresAt ? dto.expiresAt.slice(0, 10) : null,
        note: dto.note ?? null,
        uploadedById: user?.id ?? null,
      }),
    );
    if (doc.type === MediaVendorDocumentType.NDA && !vendor.ndaSigned) {
      vendor.ndaSigned = true;
      await this.m.save(MediaVendor, vendor);
    }
    return { message: this.t('media.vendor.document_added', lang), data: doc };
  }

  async removeDocument(id: string, documentId: string, user: UserEntity, lang: string) {
    await this.getVendor(id, user, lang);
    const doc = await this.m.findOne(MediaVendorDocument, { where: { id: documentId, vendorId: id } });
    if (!doc) throw new NotFoundException(this.t('media.vendor.document_not_found', lang));
    await this.m.delete(MediaVendorDocument, { id: documentId });
    return { message: this.t('media.vendor.document_deleted', lang), data: { id: documentId } };
  }

  // ============================================================
  // DISPONIBILITÉS
  // ============================================================
  private busyQuery(m: EntityManager, vendorIds: string[], start: Date, end: Date, excludeId?: string): SelectQueryBuilder<MediaVendorAssignment> {
    const qb = m
      .createQueryBuilder(MediaVendorAssignment, 'a')
      .leftJoinAndSelect('a.project', 'p')
      .where('a.vendorId IN (:...vendorIds)', { vendorIds })
      .andWhere('a.status IN (:...busy)', { busy: MEDIA_VENDOR_BUSY })
      .andWhere('a.startAt IS NOT NULL AND a.endAt IS NOT NULL')
      .andWhere('a.startAt < :end AND a.endAt > :start', { start, end });
    if (excludeId) qb.andWhere('a.id != :excludeId', { excludeId });
    return qb;
  }

  async availability(q: VendorAvailabilityQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, q.companyId, lang);
    const { start, end } = this.period(q.startAt, q.endAt, lang);
    const qb = this.m
      .createQueryBuilder(MediaVendor, 'v')
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status = :active', { active: MediaVendorStatus.ACTIVE });
    if (q.category) qb.andWhere('JSON_CONTAINS(v.categories, JSON_QUOTE(:category))', { category: q.category });
    if (q.role) qb.andWhere('JSON_CONTAINS(v.roles, JSON_QUOTE(:role))', { role: q.role });
    const vendors = await qb.orderBy('v.rating', 'DESC').addOrderBy('v.name', 'ASC').getMany();
    const busy = vendors.length ? await this.busyQuery(this.m, vendors.map((v) => v.id), start, end).getMany() : [];
    const busyBy = new Map<string, MediaVendorAssignment[]>();
    for (const a of busy) busyBy.set(a.vendorId, [...(busyBy.get(a.vendorId) ?? []), a]);
    return {
      message: this.t('media.vendor.availability', lang),
      data: {
        available: vendors.filter((v) => !busyBy.has(v.id)),
        busy: vendors
          .filter((v) => busyBy.has(v.id))
          .map((v) => ({
            vendor: v,
            conflicts: (busyBy.get(v.id) ?? []).map((a) => ({ id: a.id, startAt: a.startAt, endAt: a.endAt, project: a.project?.title ?? null })),
          })),
      },
    };
  }

  private period(startAt: string | Date | undefined | null, endAt: string | Date | undefined | null, lang: string) {
    const start = startAt ? new Date(startAt) : null;
    const end = endAt ? new Date(endAt) : null;
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException(this.t('media.invalid_period', lang));
    }
    return { start, end };
  }

  private async assertVendorFree(m: EntityManager, vendor: MediaVendor, start: Date | null | undefined, end: Date | null | undefined, lang: string, excludeId?: string) {
    if (!start || !end) return;
    const conflict = await this.busyQuery(m, [vendor.id], start, end, excludeId).getOne();
    if (conflict) {
      throw new ConflictException(
        this.t('media.vendor.busy', lang, {
          name: vendor.name,
          project: conflict.project?.title ?? '',
          start: this.fmt(conflict.startAt),
          end: this.fmt(conflict.endAt),
        }),
      );
    }
  }

  // ============================================================
  // MISSIONS
  // ============================================================
  private async getAssignment(id: string, user: UserEntity, lang: string, m?: EntityManager, lock = false) {
    const mgr = m ?? this.m;
    const a = await mgr.findOne(MediaVendorAssignment, { where: { id }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!a) throw new NotFoundException(this.t('media.vendor.assignment_not_found', lang));
    await this.common.company(user, a.companyId, lang);
    return a;
  }

  async assign(projectId: string, dto: CreateVendorAssignmentDto, user: UserEntity, lang: string) {
    return this.common.dataSource.transaction(async (m) => {
      const project = await this.common.getProject(projectId, user, lang, m);
      if (CLOSED_PROJECT.includes(project.status)) throw new BadRequestException(this.t('media.vendor.project_closed', lang));
      const vendor = await m.findOne(MediaVendor, { where: { id: dto.vendorId } });
      if (!vendor || vendor.companyId !== project.companyId) throw new NotFoundException(this.t('media.vendor.not_found', lang));
      if (vendor.status !== MediaVendorStatus.ACTIVE) {
        throw new BadRequestException(this.t('media.vendor.not_active', lang, { name: vendor.name, status: vendor.status }));
      }

      let session: MediaSession | null = null;
      if (dto.sessionId) {
        session = await m.findOne(MediaSession, { where: { id: dto.sessionId } });
        if (!session || session.projectId !== project.id) throw new NotFoundException(this.t('media.session_not_found', lang));
      }
      const startAt = dto.startAt ? new Date(dto.startAt) : session?.startAt ?? null;
      const endAt = dto.endAt ? new Date(dto.endAt) : session?.endAt ?? null;
      if (startAt || endAt) this.period(startAt, endAt, lang);
      await this.assertVendorFree(m, vendor, startAt, endAt, lang);

      // ✅ Prestation choisie dans la grille du prestataire : tarif, unité et devise repris
      const rate = dto.rateId ? await this.rates.rateForAssignment(m, vendor.id, dto.rateId, lang) : null;
      const quantity = dto.quantity ?? 1;
      const unitCost = dto.unitCost ?? rate?.price ?? vendor.rateAmount ?? 0;
      const amount = round2(quantity * unitCost);
      const confirmed = dto.confirmed === true;
      const a = await m.save(
        MediaVendorAssignment,
        m.create(MediaVendorAssignment, {
          companyId: project.companyId,
          vendorId: vendor.id,
          projectId: project.id,
          sessionId: session?.id ?? null,
          role: dto.role ?? vendor.roles?.[0] ?? MediaCrewRole.OTHER,
          category: dto.category ?? rate?.category ?? vendor.categories?.[0] ?? null,
          description: dto.description ?? (rate ? rate.name : null),
          startAt,
          endAt,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          quantity,
          unit: dto.unit ?? rate?.unit ?? vendor.rateUnit ?? MediaUnit.SESSION,
          unitCost,
          amount,
          currency: (dto.currency || rate?.currency || project.currency || vendor.currency || 'USD').toUpperCase(),
          amountPaid: 0,
          paymentStatus: this.payStatus(amount, 0),
          status: confirmed ? MediaVendorAssignmentStatus.CONFIRMED : MediaVendorAssignmentStatus.PROPOSED,
          confirmedAt: confirmed ? new Date() : null,
          note: dto.note ?? null,
          createdById: user?.id ?? null,
        }),
      );
      await this.common.record(
        project.id,
        MediaEventType.VENDOR_ASSIGNED,
        `Prestataire ${vendor.code} ${vendor.name} engagé (${a.role}) — ${amount} ${a.currency}`,
        user,
        { payload: { assignmentId: a.id, vendorId: vendor.id, sessionId: a.sessionId, amount, currency: a.currency } },
        m,
      );
      if (vendor.userId) {
        void this.common.notifyUsers(
          [vendor.userId],
          'vendor_assigned',
          { project: project.title, start: this.fmt(startAt) || '—', amount, currency: a.currency },
          { event: 'vendor_assigned', projectId: project.id, assignmentId: a.id },
          NotificationType.MEDIA_ASSIGNMENT,
          lang,
        );
      }
      return { message: this.t('media.vendor.assigned', lang), data: { ...a, vendor } };
    });
  }

  /** Prestataires d'un projet + coût total, payé, reste à payer et marge */
  async projectVendors(projectId: string, user: UserEntity, lang: string) {
    const project = await this.common.getProject(projectId, user, lang);
    const rows = await this.m.find(MediaVendorAssignment, {
      where: { projectId },
      relations: ['vendor', 'session'],
      order: { startAt: 'ASC', createdAt: 'ASC' },
    });
    const costs = new Map<string, { currency: string; cost: number; paid: number }>();
    for (const a of rows) {
      if (a.status === MediaVendorAssignmentStatus.CANCELLED) continue;
      const c = costs.get(a.currency) ?? { currency: a.currency, cost: 0, paid: 0 };
      c.cost = round2(c.cost + a.amount);
      c.paid = round2(c.paid + a.amountPaid);
      costs.set(a.currency, c);
    }
    const sameCurrency = costs.get(project.currency);
    const cost = sameCurrency?.cost ?? 0;
    const revenue = Number(project.total) || 0;
    return {
      message: this.t('media.vendor.project_vendors', lang),
      data: {
        assignments: rows.map((a) => ({ ...a, balance: round2(a.amount - a.amountPaid) })),
        costs: [...costs.values()].map((c) => ({ ...c, balance: round2(c.cost - c.paid) })),
        margin: {
          currency: project.currency,
          revenue,
          vendorCost: cost,
          margin: round2(revenue - cost),
          marginRate: revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : null,
          /** Coûts dans une autre devise que le projet : non déduits de la marge */
          otherCurrencies: [...costs.keys()].filter((c) => c !== project.currency),
        },
      },
    };
  }

  async listAssignments(q: VendorAssignmentQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, q.companyId, lang);
    const { page, limit, skip } = pageParams(q.page, q.limit);
    const qb = this.m
      .createQueryBuilder(MediaVendorAssignment, 'a')
      .leftJoinAndSelect('a.vendor', 'v')
      .leftJoinAndSelect('a.project', 'p')
      .leftJoinAndSelect('a.session', 's')
      .where('a.companyId = :companyId', { companyId });
    if (q.vendorId) qb.andWhere('a.vendorId = :vendorId', { vendorId: q.vendorId });
    if (q.projectId) qb.andWhere('a.projectId = :projectId', { projectId: q.projectId });
    const st = list(q.status).map((s) => s.toUpperCase());
    if (st.length) qb.andWhere('a.status IN (:...st)', { st });
    const ps = list(q.paymentStatus).map((s) => s.toUpperCase());
    if (ps.length) qb.andWhere('a.paymentStatus IN (:...ps)', { ps });
    if (q.late === 'true') {
      qb.andWhere('a.dueAt < :now', { now: new Date() }).andWhere('a.status IN (:...open)', {
        open: [MediaVendorAssignmentStatus.CONFIRMED, MediaVendorAssignmentStatus.IN_PROGRESS],
      });
    }
    const from = parseDate(q.from);
    const to = parseDate(q.to, true);
    if (from) qb.andWhere('COALESCE(a.startAt, a.createdAt) >= :from', { from });
    if (to) qb.andWhere('COALESCE(a.startAt, a.createdAt) <= :to', { to });
    if (q.search?.trim()) {
      const kw = `%${q.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('LOWER(v.name) LIKE :kw', { kw })
            .orWhere('LOWER(v.code) LIKE :kw', { kw })
            .orWhere('LOWER(p.title) LIKE :kw', { kw })
            .orWhere('LOWER(p.reference) LIKE :kw', { kw })
            .orWhere('LOWER(a.description) LIKE :kw', { kw }),
        ),
      );
    }
    const [rows, total] = await qb.orderBy('a.createdAt', 'DESC').addOrderBy('a.id', 'ASC').skip(skip).take(limit).getManyAndCount();
    const data = rows.map((a) => ({ ...a, balance: round2(a.amount - a.amountPaid) }));
    return { message: this.t('media.vendor.assignments', lang), data: new PaginatedResponseDto<any>(data, total, page, limit) };
  }

  async findAssignment(id: string, user: UserEntity, lang: string) {
    const a = await this.getAssignment(id, user, lang);
    const full = await this.m.findOne(MediaVendorAssignment, { where: { id }, relations: ['vendor', 'project', 'session'] });
    const payments = await this.m.find(MediaVendorPayment, { where: { assignmentId: id }, order: { paidAt: 'DESC' } });
    return {
      message: this.t('media.vendor.assignment', lang),
      data: { ...full, balance: round2(a.amount - a.amountPaid), payments, nextStatuses: MEDIA_VENDOR_TRANSITIONS[a.status] },
    };
  }

  async updateAssignment(id: string, dto: UpdateVendorAssignmentDto, user: UserEntity, lang: string) {
    return this.common.dataSource.transaction(async (m) => {
      const a = await this.getAssignment(id, user, lang, m, true);
      if ([MediaVendorAssignmentStatus.VALIDATED, MediaVendorAssignmentStatus.CANCELLED].includes(a.status)) {
        throw new BadRequestException(this.t('media.vendor.assignment_locked', lang));
      }
      const startAt = dto.startAt ? new Date(dto.startAt) : a.startAt;
      const endAt = dto.endAt ? new Date(dto.endAt) : a.endAt;
      if (dto.startAt || dto.endAt) {
        this.period(startAt, endAt, lang);
        const vendor = await m.findOne(MediaVendor, { where: { id: a.vendorId } });
        if (vendor) await this.assertVendorFree(m, vendor, startAt, endAt, lang, a.id);
      }
      const quantity = dto.quantity ?? a.quantity;
      const unitCost = dto.unitCost ?? a.unitCost;
      const amount = round2(quantity * unitCost);
      if (amount < a.amountPaid - EPS) {
        throw new BadRequestException(this.t('media.vendor.amount_below_paid', lang, { paid: a.amountPaid, currency: a.currency }));
      }
      Object.assign(a, {
        role: dto.role ?? a.role,
        category: dto.category ?? a.category,
        description: dto.description ?? a.description,
        note: dto.note ?? a.note,
        unit: dto.unit ?? a.unit,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : a.dueAt,
        startAt,
        endAt,
        quantity,
        unitCost,
        amount,
        paymentStatus: this.payStatus(amount, a.amountPaid),
      });
      const saved = await m.save(MediaVendorAssignment, a);
      await this.common.record(a.projectId, MediaEventType.VENDOR_UPDATED, `Mission prestataire modifiée — ${amount} ${a.currency}`, user, {
        payload: { assignmentId: a.id, vendorId: a.vendorId, amount },
      }, m);
      return { message: this.t('media.vendor.assignment_updated', lang), data: saved };
    });
  }

  async changeAssignmentStatus(id: string, dto: VendorAssignmentStatusDto, user: UserEntity, lang: string) {
    const result = await this.common.dataSource.transaction(async (m) => {
      const a = await this.getAssignment(id, user, lang, m, true);
      const from = a.status;
      if (!MEDIA_VENDOR_TRANSITIONS[from].includes(dto.status)) {
        throw new BadRequestException(this.t('media.vendor.invalid_transition', lang, { from, to: dto.status }));
      }
      const now = new Date();
      if (dto.status === MediaVendorAssignmentStatus.CANCELLED) {
        if (!dto.reason?.trim()) throw new BadRequestException(this.t('media.cancel_reason_required', lang));
        if (a.amountPaid > EPS) {
          throw new BadRequestException(this.t('media.vendor.cancel_paid', lang, { paid: a.amountPaid, currency: a.currency }));
        }
        a.cancelledAt = now;
        a.cancelReason = dto.reason.trim();
      }
      if (dto.status === MediaVendorAssignmentStatus.CONFIRMED) {
        // Le prestataire doit toujours être disponible au moment de confirmer
        const vendor = await m.findOne(MediaVendor, { where: { id: a.vendorId } });
        if (vendor && BLOCKED.includes(vendor.status)) {
          throw new BadRequestException(this.t('media.vendor.not_active', lang, { name: vendor.name, status: vendor.status }));
        }
        a.confirmedAt = now;
      }
      if (dto.status === MediaVendorAssignmentStatus.DELIVERED) {
        a.deliveredAt = now;
        if (dto.deliveryUrl) a.deliveryUrl = dto.deliveryUrl;
      }
      if (dto.status === MediaVendorAssignmentStatus.VALIDATED) {
        a.validatedAt = now;
        const details: Record<string, number> = {};
        if (dto.quality) details.quality = dto.quality;
        if (dto.punctuality) details.punctuality = dto.punctuality;
        if (dto.communication) details.communication = dto.communication;
        const values = Object.values(details);
        const rating = dto.rating ?? (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null);
        if (rating) {
          a.rating = rating;
          a.ratingDetails = Object.keys(details).length ? details : null;
          a.review = dto.review?.trim() || null;
        }
      }
      if (dto.status === MediaVendorAssignmentStatus.IN_PROGRESS && from === MediaVendorAssignmentStatus.DELIVERED) {
        // Retouches demandées
        a.deliveredAt = null;
        if (dto.reason) a.note = dto.reason.slice(0, 500);
      }
      a.status = dto.status;
      const saved = await m.save(MediaVendorAssignment, a);
      if (dto.status === MediaVendorAssignmentStatus.VALIDATED && a.rating) await this.refreshRating(m, a.vendorId);
      await this.common.record(a.projectId, MediaEventType.VENDOR_UPDATED, `Mission prestataire : ${from} → ${dto.status}`, user, {
        fromStatus: from,
        toStatus: dto.status,
        payload: { assignmentId: a.id, vendorId: a.vendorId, reason: dto.reason ?? null, rating: a.rating ?? null },
      }, m);
      return saved;
    });
    void this.notifyStatus(result, user, lang);
    return { message: this.t('media.vendor.assignment_status_changed', lang), data: result };
  }

  /** Note moyenne du prestataire = moyenne des missions validées et notées */
  private async refreshRating(m: EntityManager, vendorId: string) {
    const r = await m
      .createQueryBuilder(MediaVendorAssignment, 'a')
      .select('AVG(a.rating)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('a.vendorId = :vendorId', { vendorId })
      .andWhere('a.rating IS NOT NULL')
      .getRawOne();
    await m.update(MediaVendor, { id: vendorId }, { rating: round2(Number(r?.avg || 0)), ratingCount: Number(r?.count || 0) });
  }

  private async notifyStatus(a: MediaVendorAssignment, actor: UserEntity, lang: string) {
    try {
      const [vendor, project] = await Promise.all([
        this.m.findOne(MediaVendor, { where: { id: a.vendorId } }),
        this.m.findOne(MediaProject, { where: { id: a.projectId } }),
      ]);
      if (!vendor || !project) return;
      const params = { vendor: vendor.name, project: project.title, reason: a.cancelReason ?? '' };
      const data = { event: `vendor_${a.status.toLowerCase()}`, projectId: project.id, assignmentId: a.id };
      // Chef de projet : travail rendu à contrôler
      if (a.status === MediaVendorAssignmentStatus.DELIVERED && project.managerId && project.managerId !== actor?.id) {
        await this.common.notifyUsers([project.managerId], 'vendor_delivered', params, data, NotificationType.MEDIA_PROJECT_UPDATE, lang);
      }
      // Prestataire (s'il a un compte) : annulation / validation
      if (vendor.userId && vendor.userId !== actor?.id) {
        if (a.status === MediaVendorAssignmentStatus.CANCELLED) {
          await this.common.notifyUsers([vendor.userId], 'vendor_cancelled', params, data, NotificationType.MEDIA_ASSIGNMENT, lang);
        }
        if (a.status === MediaVendorAssignmentStatus.VALIDATED) {
          await this.common.notifyUsers([vendor.userId], 'vendor_validated', params, data, NotificationType.MEDIA_ASSIGNMENT, lang);
        }
      }
    } catch {
      /* notification facultative */
    }
  }

  async removeAssignment(id: string, user: UserEntity, lang: string) {
    const a = await this.getAssignment(id, user, lang);
    const payments = await this.m.count(MediaVendorPayment, { where: { assignmentId: id } });
    if (payments || ![MediaVendorAssignmentStatus.PROPOSED, MediaVendorAssignmentStatus.CANCELLED].includes(a.status)) {
      throw new BadRequestException(this.t('media.vendor.assignment_cannot_delete', lang));
    }
    await this.m.delete(MediaVendorAssignment, { id });
    await this.common.record(a.projectId, MediaEventType.VENDOR_UPDATED, 'Mission prestataire supprimée', user, {
      payload: { assignmentId: id, vendorId: a.vendorId },
    });
    return { message: this.t('media.vendor.assignment_deleted', lang), data: { id } };
  }

  // ============================================================
  // PAIEMENTS
  // ============================================================
  async addPayment(assignmentId: string, dto: AddVendorPaymentDto, user: UserEntity, lang: string) {
    const out = await this.common.dataSource.transaction(async (m) => {
      const a = await this.getAssignment(assignmentId, user, lang, m, true);
      if ([MediaVendorAssignmentStatus.PROPOSED, MediaVendorAssignmentStatus.CANCELLED].includes(a.status)) {
        throw new BadRequestException(this.t('media.vendor.payment_not_allowed', lang, { status: a.status }));
      }
      const remaining = round2(a.amount - a.amountPaid);
      if (dto.amount > remaining + EPS) {
        throw new BadRequestException(this.t('media.vendor.payment_exceeds', lang, { remaining, currency: a.currency }));
      }
      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
      if (paidAt.getTime() > Date.now() + 5 * 60000) throw new BadRequestException(this.t('media.vendor.payment_future', lang));
      const payment = await m.save(
        MediaVendorPayment,
        m.create(MediaVendorPayment, {
          companyId: a.companyId,
          vendorId: a.vendorId,
          assignmentId: a.id,
          projectId: a.projectId,
          amount: round2(dto.amount),
          currency: a.currency,
          method: dto.method ?? MediaPaymentMethod.CASH,
          reference: dto.reference ?? null,
          receiptUrl: dto.receiptUrl ?? null,
          paidAt,
          note: dto.note ?? null,
          paidById: user?.id ?? null,
        }),
      );
      a.amountPaid = round2(a.amountPaid + payment.amount);
      a.paymentStatus = this.payStatus(a.amount, a.amountPaid);
      await m.save(MediaVendorAssignment, a);
      await this.common.record(a.projectId, MediaEventType.VENDOR_PAYMENT, `Paiement prestataire : ${payment.amount} ${payment.currency} (${payment.method})`, user, {
        payload: { assignmentId: a.id, vendorId: a.vendorId, paymentId: payment.id, amount: payment.amount },
      }, m);
      return { payment, assignment: a };
    });
    const vendor = await this.m.findOne(MediaVendor, { where: { id: out.assignment.vendorId } });
    if (vendor?.userId) {
      const project = await this.m.findOne(MediaProject, { where: { id: out.assignment.projectId } });
      void this.common.notifyUsers(
        [vendor.userId],
        'vendor_paid',
        { amount: out.payment.amount, currency: out.payment.currency, project: project?.title ?? '' },
        { event: 'vendor_paid', assignmentId: out.assignment.id, paymentId: out.payment.id },
        NotificationType.MEDIA_ASSIGNMENT,
        lang,
      );
    }
    return {
      message: this.t('media.vendor.payment_added', lang),
      data: { ...out.payment, assignment: { id: out.assignment.id, amount: out.assignment.amount, amountPaid: out.assignment.amountPaid, balance: round2(out.assignment.amount - out.assignment.amountPaid), paymentStatus: out.assignment.paymentStatus } },
    };
  }

  async deletePayment(assignmentId: string, paymentId: string, user: UserEntity, lang: string) {
    return this.common.dataSource.transaction(async (m) => {
      const a = await this.getAssignment(assignmentId, user, lang, m, true);
      const p = await m.findOne(MediaVendorPayment, { where: { id: paymentId, assignmentId } });
      if (!p) throw new NotFoundException(this.t('media.vendor.payment_not_found', lang));
      await m.delete(MediaVendorPayment, { id: paymentId });
      a.amountPaid = round2(Math.max(0, a.amountPaid - p.amount));
      a.paymentStatus = this.payStatus(a.amount, a.amountPaid);
      await m.save(MediaVendorAssignment, a);
      await this.common.record(a.projectId, MediaEventType.VENDOR_PAYMENT, `Paiement prestataire annulé : ${p.amount} ${p.currency}`, user, {
        payload: { assignmentId: a.id, vendorId: a.vendorId, paymentId, amount: -p.amount },
      }, m);
      return { message: this.t('media.vendor.payment_deleted', lang), data: { id: paymentId, amountPaid: a.amountPaid, paymentStatus: a.paymentStatus } };
    });
  }

  /** Dettes envers les prestataires (missions non annulées, non soldées) */
  async payables(companyIdParam: string | undefined, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, companyIdParam, lang);
    const rows = await this.m
      .createQueryBuilder(MediaVendorAssignment, 'a')
      .innerJoin('a.vendor', 'v')
      .select('v.id', 'vendorId')
      .addSelect('v.code', 'code')
      .addSelect('v.name', 'name')
      .addSelect('v.paymentMethod', 'paymentMethod')
      .addSelect('v.mobileMoneyNumber', 'mobileMoneyNumber')
      .addSelect('a.currency', 'currency')
      .addSelect('COUNT(*)', 'missions')
      .addSelect('SUM(a.amount - a.amountPaid)', 'balance')
      .addSelect("SUM(CASE WHEN a.status IN ('DELIVERED','VALIDATED') THEN a.amount - a.amountPaid ELSE 0 END)", 'due')
      .where('a.companyId = :companyId', { companyId })
      .andWhere('a.status != :cancelled', { cancelled: MediaVendorAssignmentStatus.CANCELLED })
      .andWhere('a.amount - a.amountPaid > 0.005')
      .groupBy('v.id')
      .addGroupBy('v.code')
      .addGroupBy('v.name')
      .addGroupBy('v.paymentMethod')
      .addGroupBy('v.mobileMoneyNumber')
      .addGroupBy('a.currency')
      .orderBy('balance', 'DESC')
      .getRawMany();
    const vendors = rows.map((r) => ({
      vendorId: r.vendorId,
      code: r.code,
      name: r.name,
      paymentMethod: r.paymentMethod,
      mobileMoneyNumber: r.mobileMoneyNumber,
      currency: r.currency,
      missions: Number(r.missions),
      balance: round2(Number(r.balance)),
      /** Travail rendu : exigible maintenant */
      dueNow: round2(Number(r.due)),
    }));
    const totals = new Map<string, { currency: string; balance: number; dueNow: number }>();
    for (const v of vendors) {
      const t = totals.get(v.currency) ?? { currency: v.currency, balance: 0, dueNow: 0 };
      t.balance = round2(t.balance + v.balance);
      t.dueNow = round2(t.dueNow + v.dueNow);
      totals.set(v.currency, t);
    }
    return { message: this.t('media.vendor.payables', lang), data: { totals: [...totals.values()], vendors } };
  }

  /** Relevé d'un prestataire sur une période (JSON, Excel ou PDF) */
  async statement(id: string, q: VendorStatementQueryDto, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(id, user, lang);
    const from = parseDate(q.from) ?? new Date(new Date().getFullYear(), 0, 1);
    const to = parseDate(q.to, true) ?? new Date();
    const [missions, payments] = await Promise.all([
      this.m
        .createQueryBuilder(MediaVendorAssignment, 'a')
        .leftJoinAndSelect('a.project', 'p')
        .where('a.vendorId = :id', { id })
        .andWhere('a.status != :cancelled', { cancelled: MediaVendorAssignmentStatus.CANCELLED })
        .andWhere('COALESCE(a.startAt, a.createdAt) BETWEEN :from AND :to', { from, to })
        .orderBy('COALESCE(a.startAt, a.createdAt)', 'ASC')
        .getMany(),
      this.m
        .createQueryBuilder(MediaVendorPayment, 'pay')
        .where('pay.vendorId = :id', { id })
        .andWhere('pay.paidAt BETWEEN :from AND :to', { from, to })
        .orderBy('pay.paidAt', 'ASC')
        .getMany(),
    ]);
    const totals = new Map<string, { currency: string; agreed: number; paid: number }>();
    for (const a of missions) {
      const t = totals.get(a.currency) ?? { currency: a.currency, agreed: 0, paid: 0 };
      t.agreed = round2(t.agreed + a.amount);
      totals.set(a.currency, t);
    }
    for (const p of payments) {
      const t = totals.get(p.currency) ?? { currency: p.currency, agreed: 0, paid: 0 };
      t.paid = round2(t.paid + p.amount);
      totals.set(p.currency, t);
    }
    const summary = [...totals.values()].map((t) => ({ ...t, balance: round2(t.agreed - t.paid) }));
    const day = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    const T = (k: string) => this.t(`media.vendor.st.${k}`, lang);

    if (q.format === 'xlsx') {
      const buffer = await buildXlsx([
        {
          name: T('missions'),
          columns: [
            { header: T('date'), width: 12 },
            { header: T('project'), width: 34 },
            { header: T('role'), width: 18 },
            { header: T('status'), width: 14 },
            { header: T('amount'), width: 12 },
            { header: T('paid'), width: 12 },
            { header: T('balance'), width: 12 },
            { header: T('currency'), width: 8 },
          ],
          rows: missions.map((a) => [
            day(a.startAt ?? a.createdAt),
            a.project ? `${a.project.reference} — ${a.project.title}` : '',
            a.role,
            a.status,
            a.amount,
            a.amountPaid,
            round2(a.amount - a.amountPaid),
            a.currency,
          ]),
        },
        {
          name: T('payments'),
          columns: [
            { header: T('date'), width: 12 },
            { header: T('amount'), width: 12 },
            { header: T('currency'), width: 8 },
            { header: T('method'), width: 16 },
            { header: T('reference'), width: 24 },
            { header: T('note'), width: 40 },
          ],
          rows: payments.map((p) => [day(p.paidAt), p.amount, p.currency, p.method, p.reference ?? '', p.note ?? '']),
        },
      ]);
      return { file: { buffer, fileName: `releve_${vendor.code}_${day(from)}_${day(to)}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } };
    }

    if (q.format === 'pdf') {
      const rowsM = missions
        .map((a) => `<tr><td>${h(day(a.startAt ?? a.createdAt))}</td><td>${h(a.project ? `${a.project.reference} — ${a.project.title}` : '')}</td><td>${h(a.role)}</td><td>${h(a.status)}</td><td class="n">${a.amount.toFixed(2)}</td><td class="n">${a.amountPaid.toFixed(2)}</td><td class="n">${round2(a.amount - a.amountPaid).toFixed(2)}</td><td>${h(a.currency)}</td></tr>`)
        .join('');
      const rowsP = payments
        .map((p) => `<tr><td>${h(day(p.paidAt))}</td><td class="n">${p.amount.toFixed(2)}</td><td>${h(p.currency)}</td><td>${h(p.method)}</td><td>${h(p.reference ?? '')}</td></tr>`)
        .join('');
      const rowsT = summary
        .map((s) => `<tr><td>${h(s.currency)}</td><td class="n">${s.agreed.toFixed(2)}</td><td class="n">${s.paid.toFixed(2)}</td><td class="n"><b>${s.balance.toFixed(2)}</b></td></tr>`)
        .join('');
      const html = `<html${lang === 'ar' ? ' dir="rtl"' : ''}><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;font-size:11px;color:#222}h1{font-size:17px;margin:0}h2{font-size:13px;margin:16px 0 6px}
        table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px;text-align:start}th{background:#f0f0f0}.n{text-align:end}.muted{color:#666}
        </style></head><body>
        <h1>${h(T('title'))}</h1>
        <p><b>${h(vendor.code)} — ${h(vendor.name)}</b>${vendor.legalName ? ` (${h(vendor.legalName)})` : ''}<br>
        <span class="muted">${h(vendor.phone ?? '')} ${h(vendor.email ?? '')}</span><br>
        ${h(T('period'))} : ${h(day(from))} → ${h(day(to))}</p>
        <h2>${h(T('summary'))}</h2><table><tr><th>${h(T('currency'))}</th><th>${h(T('amount'))}</th><th>${h(T('paid'))}</th><th>${h(T('balance'))}</th></tr>${rowsT}</table>
        <h2>${h(T('missions'))}</h2><table><tr><th>${h(T('date'))}</th><th>${h(T('project'))}</th><th>${h(T('role'))}</th><th>${h(T('status'))}</th><th>${h(T('amount'))}</th><th>${h(T('paid'))}</th><th>${h(T('balance'))}</th><th>${h(T('currency'))}</th></tr>${rowsM}</table>
        <h2>${h(T('payments'))}</h2><table><tr><th>${h(T('date'))}</th><th>${h(T('amount'))}</th><th>${h(T('currency'))}</th><th>${h(T('method'))}</th><th>${h(T('reference'))}</th></tr>${rowsP}</table>
        </body></html>`;
      return { file: { buffer: await htmlToPdf(html), fileName: `releve_${vendor.code}_${day(from)}_${day(to)}.pdf`, mime: 'application/pdf' } };
    }

    return {
      message: this.t('media.vendor.statement', lang),
      data: { vendor, period: { from, to }, summary, missions: missions.map((a) => this.summary(a)), payments },
    };
  }

  // ============================================================
  // TABLEAU DE BORD
  // ============================================================
  async dashboard(companyIdParam: string | undefined, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, companyIdParam, lang);
    const now = new Date();
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [byStatus, payables, paidMonth, late, toConfirm, toValidate, expiringDocs, contractsEnding, top] = await Promise.all([
      this.m.createQueryBuilder(MediaVendor, 'v').select('v.status', 'status').addSelect('COUNT(*)', 'count').where('v.companyId = :companyId', { companyId }).groupBy('v.status').getRawMany(),
      this.payables(companyId, user, lang),
      this.m
        .createQueryBuilder(MediaVendorPayment, 'p')
        .select('p.currency', 'currency')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'amount')
        .where('p.companyId = :companyId', { companyId })
        .andWhere('p.paidAt >= :monthStart', { monthStart })
        .groupBy('p.currency')
        .getRawMany(),
      this.m
        .createQueryBuilder(MediaVendorAssignment, 'a')
        .leftJoinAndSelect('a.vendor', 'v')
        .leftJoinAndSelect('a.project', 'p')
        .where('a.companyId = :companyId', { companyId })
        .andWhere('a.dueAt < :now', { now })
        .andWhere('a.status IN (:...open)', { open: [MediaVendorAssignmentStatus.CONFIRMED, MediaVendorAssignmentStatus.IN_PROGRESS] })
        .orderBy('a.dueAt', 'ASC')
        .take(20)
        .getMany(),
      this.m.count(MediaVendorAssignment, { where: { companyId, status: MediaVendorAssignmentStatus.PROPOSED } }),
      this.m.count(MediaVendorAssignment, { where: { companyId, status: MediaVendorAssignmentStatus.DELIVERED } }),
      this.m
        .createQueryBuilder(MediaVendorDocument, 'd')
        .leftJoinAndSelect('d.vendor', 'v')
        .where('d.companyId = :companyId', { companyId })
        .andWhere('d.expiresAt IS NOT NULL AND d.expiresAt <= :in30', { in30 })
        .andWhere('v.status IN (:...st)', { st: [MediaVendorStatus.ACTIVE, MediaVendorStatus.PROSPECT] })
        .orderBy('d.expiresAt', 'ASC')
        .take(20)
        .getMany(),
      this.m
        .createQueryBuilder(MediaVendor, 'v')
        .where('v.companyId = :companyId', { companyId })
        .andWhere('v.status = :active', { active: MediaVendorStatus.ACTIVE })
        .andWhere('v.contractEndDate IS NOT NULL AND v.contractEndDate <= :in30', { in30 })
        .orderBy('v.contractEndDate', 'ASC')
        .take(20)
        .getMany(),
      this.m
        .createQueryBuilder(MediaVendorAssignment, 'a')
        .innerJoin('a.vendor', 'v')
        .select('v.id', 'vendorId')
        .addSelect('v.name', 'name')
        .addSelect('v.rating', 'rating')
        .addSelect('a.currency', 'currency')
        .addSelect('COUNT(*)', 'missions')
        .addSelect('SUM(a.amount)', 'amount')
        .where('a.companyId = :companyId', { companyId })
        .andWhere('a.status != :cancelled', { cancelled: MediaVendorAssignmentStatus.CANCELLED })
        .andWhere('a.createdAt >= :yearStart', { yearStart: new Date(now.getFullYear(), 0, 1) })
        .groupBy('v.id')
        .addGroupBy('v.name')
        .addGroupBy('v.rating')
        .addGroupBy('a.currency')
        .orderBy('missions', 'DESC')
        .limit(10)
        .getRawMany(),
    ]);

    return {
      message: this.t('media.vendor.dashboard', lang),
      data: {
        vendorsByStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
        payables: payables.data.totals,
        paidThisMonth: paidMonth.map((r) => ({ currency: r.currency, amount: round2(Number(r.amount)) })),
        missionsToConfirm: toConfirm,
        deliveriesToValidate: toValidate,
        lateMissions: late.map((a) => ({ ...this.summary(a), vendor: a.vendor ? { id: a.vendor.id, name: a.vendor.name, phone: a.vendor.phone } : null })),
        expiringDocuments: expiringDocs.map((d) => ({
          id: d.id,
          type: d.type,
          title: d.title,
          expiresAt: d.expiresAt,
          expired: String(d.expiresAt).slice(0, 10) < today,
          vendor: d.vendor ? { id: d.vendor.id, name: d.vendor.name } : null,
        })),
        contractsEnding: contractsEnding.map((v) => ({ id: v.id, code: v.code, name: v.name, contractEndDate: v.contractEndDate })),
        topVendors: top.map((r) => ({ vendorId: r.vendorId, name: r.name, rating: Number(r.rating), currency: r.currency, missions: Number(r.missions), amount: round2(Number(r.amount)) })),
      },
    };
  }
}
