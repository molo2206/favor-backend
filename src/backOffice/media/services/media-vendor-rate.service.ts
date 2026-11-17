import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, EntityManager } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { pageParams } from 'src/backOffice/logistics/common/logistics-access';
import { buildXlsx, h, htmlToPdf } from 'src/backOffice/needs/common/needs-export';
import { MediaUnit, MediaVendorDomain, MediaVendorStatus } from '../media.enums';
import { MediaVendor } from '../entities/media-vendor.entity';
import { MediaVendorRate } from '../entities/media-vendor-rate.entity';
import {
  CreateVendorRateDto,
  UpdateVendorRateDto,
  VendorRateStatusDto,
  VendorRatesExportQueryDto,
  VendorRatesQueryDto,
} from '../dto/vendor.dto';
import { MediaCommonService } from './media-common.service';

const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

function list(v?: string): string[] {
  return String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * ✅ PRESTATIONS ET TARIFS DES PRESTATAIRES EXTERNES
 *  - Grille de prestations par prestataire (nom, unité, prix, devise, conditions), activable / désactivable
 *  - Catalogue de tous les tarifs (recherche, filtres par domaine, devise, prix) pour comparer les prestataires
 *  - Export Excel / PDF de la grille
 * Volontairement simple : pas de contrat ni de facturation ici.
 */
@Injectable()
export class MediaVendorRateService {
  constructor(private readonly common: MediaCommonService) { }

  private get m() {
    return this.common.dataSource.manager;
  }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.common.t(key, lang, params);
  }

  /** Libellé traduit d'un domaine */
  domainLabel(domain: string | null | undefined, lang: string): string {
    if (!domain) return '';
    const key = `media.vendor.domain.${domain}`;
    const label = this.t(key, lang);
    return label === key ? domain : label;
  }

  private unitLabel(unit: string, lang: string): string {
    const key = `media.vendor.unit.${unit}`;
    const label = this.t(key, lang);
    return label === key ? unit : label;
  }

  private async getVendor(id: string, user: UserEntity, lang: string, m?: EntityManager) {
    const vendor = await (m ?? this.m).findOne(MediaVendor, { where: { id } });
    if (!vendor) throw new NotFoundException(this.t('media.vendor.not_found', lang));
    await this.common.company(user, vendor.companyId, lang);
    return vendor;
  }

  private async getRate(vendorId: string, rateId: string, lang: string) {
    const rate = await this.m.findOne(MediaVendorRate, { where: { id: rateId, vendorId } });
    if (!rate) throw new NotFoundException(this.t('media.vendor.rate_not_found', lang));
    return rate;
  }

  /** Même prestation (nom + unité + devise) déjà présente chez ce prestataire ? */
  private async assertNoDuplicate(m: EntityManager, vendorId: string, name: string, unit: string, currency: string, lang: string, excludeId?: string, ignoreIds: string[] = []) {
    const qb = m
      .createQueryBuilder(MediaVendorRate, 'r')
      .where('r.vendorId = :vendorId', { vendorId })
      .andWhere('LOWER(r.name) = :name', { name: name.trim().toLowerCase() })
      .andWhere('r.unit = :unit', { unit })
      .andWhere('r.currency = :currency', { currency });
    if (excludeId) qb.andWhere('r.id != :excludeId', { excludeId });
    if (ignoreIds.length) qb.andWhere('r.id NOT IN (:...ignoreIds)', { ignoreIds });
    if (await qb.getCount()) throw new ConflictException(this.t('media.vendor.rate_exists', lang, { name: name.trim() }));
  }

  private normalize(dto: CreateVendorRateDto | UpdateVendorRateDto, vendor: MediaVendor) {
    const out: Partial<MediaVendorRate> = {};
    if (dto.name !== undefined) out.name = dto.name.trim();
    if (dto.description !== undefined) out.description = dto.description?.trim() || null;
    if (dto.domain !== undefined) out.domain = dto.domain ?? null;
    if (dto.category !== undefined) out.category = dto.category ?? null;
    if (dto.unit !== undefined) out.unit = dto.unit;
    if (dto.price !== undefined) out.price = round2(dto.price);
    if (dto.currency !== undefined) out.currency = (dto.currency || vendor.currency || 'USD').trim().toUpperCase();
    if (dto.conditions !== undefined) out.conditions = dto.conditions?.trim() || null;
    if (dto.isActive !== undefined) out.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) out.sortOrder = dto.sortOrder;
    return out;
  }

  /** Libellé par défaut d'un prix sans nom : « Tarif par jour », « Tarif par mois »… */
  defaultName(unit: string, lang: string): string {
    const label = this.t('media.vendor.rate_default_name', lang, { unit: this.unitLabel(unit, lang).toLowerCase() });
    return label === 'media.vendor.rate_default_name' ? `Tarif (${this.unitLabel(unit, lang).toLowerCase()})` : label;
  }

  /**
   * ✅ Remplace la grille de prix d'un prestataire (modification de la fiche) :
   * id connu → modifié ; sans id → ajouté ; absent de la liste → désactivé (jamais supprimé : missions).
   */
  async syncForVendor(m: EntityManager, vendor: MediaVendor, rates: CreateVendorRateDto[], user: UserEntity | null, lang: string): Promise<MediaVendorRate[]> {
    const existing: MediaVendorRate[] = await m.find(MediaVendorRate, { where: { vendorId: vendor.id } });
    const byId = new Map<string, MediaVendorRate>(existing.map((r) => [r.id, r]));
    const keep = new Set<string>();
    const seen = new Set<string>();
    const out: MediaVendorRate[] = [];
    let order = 0;
    const sigOf = (name: string, unit: string, currency: string) => `${name.trim().toLowerCase()}|${unit}|${currency}`;
    const ids = new Set(rates.map((r) => r.id).filter(Boolean) as string[]);
    for (const dto of rates) {
      let current: MediaVendorRate | undefined = dto.id ? byId.get(dto.id) : undefined;
      if (dto.id && !current) throw new NotFoundException(this.t('media.vendor.rate_not_found', lang));
      const unit = dto.unit ?? current?.unit ?? MediaUnit.PROJECT;
      const currency = (dto.currency || current?.currency || vendor.currency || 'USD').trim().toUpperCase();
      const name = dto.name?.trim() || current?.name || this.defaultName(unit, lang);
      const sig = sigOf(name, unit, currency);
      if (seen.has(sig)) throw new ConflictException(this.t('media.vendor.rate_exists', lang, { name }));
      seen.add(sig);
      // Nouveau prix identique à un ancien (même libellé, unité, devise) : l'ancien est repris et réactivé
      if (!current) current = existing.find((r) => !keep.has(r.id) && !ids.has(r.id) && sigOf(r.name, r.unit, r.currency) === sig);
      if (current) {
        Object.assign(current, this.normalize(dto, vendor), { name, unit, currency, isActive: dto.isActive ?? true, sortOrder: dto.sortOrder ?? order++ });
        out.push(await m.save(MediaVendorRate, current));
        keep.add(current.id);
      } else {
        const [created] = await this.insertMany(m, vendor, [{ ...dto, name, unit, currency, sortOrder: dto.sortOrder ?? order++ }], user, lang, existing.map((r) => r.id));
        out.push(created);
        keep.add(created.id);
      }
    }
    for (const r of existing) {
      if (!keep.has(r.id) && r.isActive) {
        r.isActive = false;
        await m.save(MediaVendorRate, r);
      }
    }
    return out;
  }

  /** Ajoute plusieurs prestations (utilisé aussi à la création du prestataire) */
  async insertMany(
    m: EntityManager,
    vendor: MediaVendor,
    rates: CreateVendorRateDto[],
    user: UserEntity | null,
    lang: string,
    /** Prix existants ignorés par le contrôle des doublons (ils vont être modifiés dans la même opération) */
    ignoreIds: string[] = [],
  ): Promise<MediaVendorRate[]> {
    const seen = new Set<string>();
    const out: MediaVendorRate[] = [];
    let order = 0;
    for (const dto of rates) {
      const unit = dto.unit ?? MediaUnit.PROJECT;
      const currency = (dto.currency || vendor.currency || 'USD').trim().toUpperCase();
      // ✅ Nom facultatif : « Tarif par jour », « Tarif par mois »…
      const name = dto.name?.trim() || this.defaultName(unit, lang);
      const sig = `${name.toLowerCase()}|${unit}|${currency}`;
      if (seen.has(sig)) throw new ConflictException(this.t('media.vendor.rate_exists', lang, { name }));
      seen.add(sig);
      await this.assertNoDuplicate(m, vendor.id, name, unit, currency, lang, undefined, ignoreIds);
      const { id: _id, ...clean } = dto;
      out.push(
        await m.save(
          MediaVendorRate,
          m.create(MediaVendorRate, {
            ...this.normalize(clean, vendor),
            name,
            companyId: vendor.companyId,
            vendorId: vendor.id,
            unit,
            currency,
            domain: dto.domain ?? (vendor.domains?.length === 1 ? vendor.domains[0] : null),
            isActive: dto.isActive ?? true,
            sortOrder: dto.sortOrder ?? order++,
            createdById: user?.id ?? null,
          }),
        ),
      );
    }
    return out;
  }

  // ============================================================
  // GRILLE D'UN PRESTATAIRE
  // ============================================================
  async listForVendor(vendorId: string, user: UserEntity, lang: string, includeInactive = true) {
    const vendor = await this.getVendor(vendorId, user, lang);
    const rates = await this.ratesOf([vendor.id], includeInactive);
    return {
      message: this.t('media.vendor.rate_list', lang),
      data: {
        vendor: { id: vendor.id, code: vendor.code, name: vendor.name, photoUrl: vendor.photoUrl ?? null, status: vendor.status, currency: vendor.currency },
        rates: (rates.get(vendor.id) ?? []).map((r) => this.view(r, lang)),
      },
    };
  }

  /** Prestations de plusieurs prestataires, regroupées */
  async ratesOf(vendorIds: string[], includeInactive = false): Promise<Map<string, MediaVendorRate[]>> {
    const map = new Map<string, MediaVendorRate[]>();
    if (!vendorIds.length) return map;
    const qb = this.m.createQueryBuilder(MediaVendorRate, 'r').where('r.vendorId IN (:...ids)', { ids: vendorIds });
    if (!includeInactive) qb.andWhere('r.isActive = 1');
    const rows = await qb.orderBy('r.sortOrder', 'ASC').addOrderBy('r.name', 'ASC').getMany();
    for (const r of rows) {
      const arr = map.get(r.vendorId) ?? [];
      arr.push(r);
      map.set(r.vendorId, arr);
    }
    return map;
  }

  view(r: MediaVendorRate, lang: string) {
    return {
      ...r,
      vendor: undefined,
      domainLabel: this.domainLabel(r.domain, lang),
      unitLabel: this.unitLabel(r.unit, lang),
    };
  }

  async create(vendorId: string, dto: CreateVendorRateDto, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(vendorId, user, lang);
    const [rate] = await this.common.dataSource.transaction((m) => this.insertMany(m, vendor, [dto], user, lang));
    return { message: this.t('media.vendor.rate_created', lang), data: this.view(rate, lang) };
  }

  async update(vendorId: string, rateId: string, dto: UpdateVendorRateDto, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(vendorId, user, lang);
    const rate = await this.getRate(vendor.id, rateId, lang);
    const patch = this.normalize(dto, vendor);
    const next = { ...rate, ...patch };
    if (dto.name !== undefined || dto.unit !== undefined || dto.currency !== undefined) {
      await this.assertNoDuplicate(this.m, vendor.id, next.name, next.unit, next.currency, lang, rate.id);
    }
    Object.assign(rate, patch);
    const saved = await this.m.save(MediaVendorRate, rate);
    return { message: this.t('media.vendor.rate_updated', lang), data: this.view(saved, lang) };
  }

  async setStatus(vendorId: string, rateId: string, dto: VendorRateStatusDto, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(vendorId, user, lang);
    const rate = await this.getRate(vendor.id, rateId, lang);
    rate.isActive = dto.isActive;
    const saved = await this.m.save(MediaVendorRate, rate);
    return {
      message: this.t(dto.isActive ? 'media.vendor.rate_enabled' : 'media.vendor.rate_disabled', lang),
      data: this.view(saved, lang),
    };
  }

  async remove(vendorId: string, rateId: string, user: UserEntity, lang: string) {
    const vendor = await this.getVendor(vendorId, user, lang);
    await this.getRate(vendor.id, rateId, lang);
    await this.m.delete(MediaVendorRate, { id: rateId });
    return { message: this.t('media.vendor.rate_deleted', lang), data: { id: rateId } };
  }

  /** Utilisé pour engager un prestataire sur une prestation précise */
  async rateForAssignment(m: EntityManager, vendorId: string, rateId: string, lang: string): Promise<MediaVendorRate> {
    const rate = await m.findOne(MediaVendorRate, { where: { id: rateId, vendorId } });
    if (!rate) throw new NotFoundException(this.t('media.vendor.rate_not_found', lang));
    if (!rate.isActive) throw new BadRequestException(this.t('media.vendor.rate_inactive', lang, { name: rate.name }));
    return rate;
  }

  // ============================================================
  // CATALOGUE DES TARIFS (tous les prestataires)
  // ============================================================
  private async catalogQuery(q: VendorRatesQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, q.companyId, lang);
    const qb = this.m
      .createQueryBuilder(MediaVendorRate, 'r')
      .innerJoinAndSelect('r.vendor', 'v')
      .where('r.companyId = :companyId', { companyId });

    if (q.activeOnly !== 'false') {
      qb.andWhere('r.isActive = 1').andWhere('v.status = :active', { active: MediaVendorStatus.ACTIVE });
    } else {
      qb.andWhere('v.status != :archived', { archived: MediaVendorStatus.ARCHIVED });
    }
    if (q.vendorId) qb.andWhere('r.vendorId = :vendorId', { vendorId: q.vendorId });
    const domains = list(q.domain).map((d) => d.toUpperCase()).filter((d) => (Object.values(MediaVendorDomain) as string[]).includes(d));
    if (domains.length) {
      // Domaine de la prestation, ou à défaut l'un des domaines du prestataire
      qb.andWhere(
        new Brackets((b) => {
          b.where('r.domain IN (:...domains)', { domains });
          domains.forEach((d, i) => b.orWhere(`(r.domain IS NULL AND JSON_CONTAINS(v.domains, JSON_QUOTE(:d${i})))`, { [`d${i}`]: d }));
        }),
      );
    }
    if (q.category) qb.andWhere('r.category = :category', { category: q.category });
    if (q.unit) qb.andWhere('r.unit = :unit', { unit: q.unit });
    if (q.currency?.trim()) qb.andWhere('r.currency = :currency', { currency: q.currency.trim().toUpperCase() });
    if (q.minPrice !== undefined) qb.andWhere('r.price >= :minPrice', { minPrice: q.minPrice });
    if (q.maxPrice !== undefined) qb.andWhere('r.price <= :maxPrice', { maxPrice: q.maxPrice });
    if (q.search?.trim()) {
      const kw = `%${q.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('LOWER(r.name) LIKE :kw', { kw })
            .orWhere('LOWER(r.description) LIKE :kw', { kw })
            .orWhere('LOWER(v.name) LIKE :kw', { kw })
            .orWhere('LOWER(v.legalName) LIKE :kw', { kw })
            .orWhere('LOWER(v.code) LIKE :kw', { kw }),
        ),
      );
    }
    const sortCol = { price: 'r.price', name: 'r.name', vendor: 'v.name', createdAt: 'r.createdAt' }[q.sortBy ?? 'name'] ?? 'r.name';
    const order = String(q.sortOrder ?? (q.sortBy === 'createdAt' ? 'DESC' : 'ASC')).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    qb.orderBy(sortCol, order).addOrderBy('r.id', 'ASC');
    return qb;
  }

  private catalogRow(r: MediaVendorRate, lang: string) {
    const v = r.vendor!;
    return {
      ...this.view(r, lang),
      vendor: {
        id: v.id,
        code: v.code,
        name: v.name,
        legalName: v.legalName ?? null,
        photoUrl: v.photoUrl ?? null,
        type: v.type,
        status: v.status,
        domains: v.domains ?? [],
        domainLabels: (v.domains ?? []).map((d) => this.domainLabel(d, lang)),
        phone: v.phone ?? null,
        email: v.email ?? null,
        city: v.city ?? null,
        rating: v.rating,
      },
    };
  }

  async catalog(q: VendorRatesQueryDto, user: UserEntity, lang: string) {
    const { page, limit, skip } = pageParams(q.page, q.limit);
    const qb = await this.catalogQuery(q, user, lang);
    const [rows, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return {
      message: this.t('media.vendor.rate_catalog', lang),
      data: new PaginatedResponseDto<any>(rows.map((r) => this.catalogRow(r, lang)), total, page, limit),
    };
  }

  /** Domaines d'intervention avec libellés et nombre de prestataires (pour les filtres) */
  async domains(companyIdParam: string | undefined, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, companyIdParam, lang);
    const vendors = await this.m
      .createQueryBuilder(MediaVendor, 'v')
      .select(['v.id', 'v.domains', 'v.status'])
      .where('v.companyId = :companyId', { companyId })
      .andWhere('v.status != :archived', { archived: MediaVendorStatus.ARCHIVED })
      .getMany();
    const count = new Map<string, { total: number; active: number }>();
    for (const v of vendors) {
      for (const d of v.domains ?? []) {
        const c = count.get(d) ?? { total: 0, active: 0 };
        c.total++;
        if (v.status === MediaVendorStatus.ACTIVE) c.active++;
        count.set(d, c);
      }
    }
    return {
      message: this.t('media.vendor.domain_list', lang),
      data: Object.values(MediaVendorDomain).map((d) => ({
        value: d,
        label: this.domainLabel(d, lang),
        vendors: count.get(d)?.total ?? 0,
        activeVendors: count.get(d)?.active ?? 0,
      })),
    };
  }

  async export(q: VendorRatesExportQueryDto, user: UserEntity, lang: string): Promise<{ buffer: Buffer; fileName: string; mime: string }> {
    const qb = await this.catalogQuery({ ...q, sortBy: q.sortBy ?? 'vendor' }, user, lang);
    const rows = await qb.take(5000).getMany();
    const stamp = new Date().toISOString().slice(0, 10);
    const c = (k: string) => this.t(`media.vendor.export.${k}`, lang);
    const domainsOf = (r: MediaVendorRate) =>
      r.domain ? this.domainLabel(r.domain, lang) : (r.vendor?.domains ?? []).map((d) => this.domainLabel(d, lang)).join(', ');

    if (q.format === 'pdf') {
      const body = rows
        .map(
          (r) =>
            `<tr><td><b>${h(r.vendor?.name ?? '')}</b><br><small>${h(r.vendor?.code ?? '')}${r.vendor?.phone ? ` · ${h(r.vendor.phone)}` : ''}</small></td>` +
            `<td>${h(domainsOf(r))}</td><td><b>${h(r.name)}</b>${r.description ? `<br><small>${h(r.description)}</small>` : ''}</td>` +
            `<td>${h(this.unitLabel(r.unit, lang))}</td><td class="n">${h(r.price.toLocaleString('fr-FR', { minimumFractionDigits: 2 }))} ${h(r.currency)}</td>` +
            `<td><small>${h(r.conditions ?? '')}</small></td></tr>`,
        )
        .join('');
      const dir = lang === 'ar' ? ' dir="rtl"' : '';
      const html = `<html${dir}><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;font-size:10px;color:#1f2937}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 10px;color:#6b7280}
        table{width:100%;border-collapse:collapse}th,td{border:1px solid #e5e7eb;padding:5px;text-align:start;vertical-align:top}
        th{background:#f3f4f6}.n{text-align:end;white-space:nowrap}small{color:#6b7280}</style></head><body>
        <h1>${h(c('title'))}</h1><p>${h(this.t('media.vendor.export.summary', lang, { date: stamp, count: rows.length }))}</p>
        <table><thead><tr><th>${h(c('vendor'))}</th><th>${h(c('domain'))}</th><th>${h(c('service'))}</th><th>${h(c('unit'))}</th><th>${h(c('price'))}</th><th>${h(c('conditions'))}</th></tr></thead>
        <tbody>${body}</tbody></table></body></html>`;
      return { buffer: await htmlToPdf(html, true), fileName: `tarifs_prestataires_${stamp}.pdf`, mime: 'application/pdf' };
    }

    const buffer = await buildXlsx([
      {
        name: c('sheet'),
        columns: [
          { header: c('code'), width: 12 },
          { header: c('vendor'), width: 28 },
          { header: c('domain'), width: 26 },
          { header: c('phone'), width: 16 },
          { header: c('email'), width: 26 },
          { header: c('service'), width: 32 },
          { header: c('description'), width: 40 },
          { header: c('unit'), width: 14 },
          { header: c('price'), width: 14 },
          { header: c('currency'), width: 8 },
          { header: c('conditions'), width: 40 },
          { header: c('status'), width: 10 },
        ],
        rows: rows.map((r) => [
          r.vendor?.code ?? '',
          r.vendor?.name ?? '',
          domainsOf(r),
          r.vendor?.phone ?? '',
          r.vendor?.email ?? '',
          r.name,
          r.description ?? '',
          this.unitLabel(r.unit, lang),
          r.price,
          r.currency,
          r.conditions ?? '',
          r.isActive ? c('active') : c('inactive'),
        ]),
      },
    ]);
    return {
      buffer,
      fileName: `tarifs_prestataires_${stamp}.xlsx`,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
