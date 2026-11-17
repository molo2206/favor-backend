import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, In, LessThanOrEqual } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { FilesService } from 'src/files/files.service';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { pageParams } from 'src/backOffice/logistics/common/logistics-access';
import { MediaPublicationStatus } from '../media.enums';
import { MediaPublication } from '../entities/media-publication.entity';
import { MediaPublicationStat } from '../entities/media-publication-stat.entity';
import { MediaFile } from '../entities/media-file.entity';
import { MediaProject } from '../entities/media-project.entity';
import {
  BulkPublicationStatsDto,
  CreatePublicationDto,
  PublicationQueryDto,
  PublicationReportQueryDto,
  RecordPublicationStatsDto,
  UpdatePublicationDto,
} from '../dto/publication.dto';
import { MediaCommonService } from './media-common.service';

const METRICS = ['views', 'likes', 'comments', 'shares'] as const;
type Metric = (typeof METRICS)[number];
type Counters = Record<Metric, number>;

const TZ = process.env.COMPANY_DEFAULT_TIMEZONE || 'Africa/Lubumbashi';
const MAX_COVER_BYTES = Number(process.env.MEDIA_MAX_FILE_MB || 50) * 1024 * 1024;

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function day(v?: string | Date | null): string {
  if (!v) return today();
  const s = typeof v === 'string' ? v : v.toISOString();
  return s.slice(0, 10);
}

function addDays(d: string, n: number): string {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function zero(): Counters {
  return { views: 0, likes: 0, comments: 0, shares: 0 };
}

function interactions(c: Counters): number {
  return c.likes + c.comments + c.shares;
}

/**
 * ✅ Média interne — publications simples :
 * ce qu'on a diffusé, où (texte libre), et les chiffres (vues, j'aime, commentaires, partages)
 * que l'admin saisit à la main. Pas de site web ni d'API de réseau social.
 */
@Injectable()
export class MediaPublicationService {
  constructor(
    private readonly common: MediaCommonService,
    private readonly files: FilesService,
  ) { }

  private get m() {
    return this.common.dataSource.manager;
  }

  private async cover(file: Express.Multer.File | undefined): Promise<string | undefined> {
    if (!file) return undefined;
    if (!(file.mimetype || '').startsWith('image/')) throw new BadRequestException(this.common.t('media.publication.cover_image_only', 'fr'));
    const info = await this.files.uploadFileDetailed(file, 'media', { imageMaxWidth: 1920, imageQuality: 85, imageThumbnail: true, maxSize: MAX_COVER_BYTES });
    return info.url;
  }

  private async getPublication(id: string, user: UserEntity, lang: string): Promise<MediaPublication> {
    const p = await this.m.findOne(MediaPublication, { where: { id } });
    if (!p) throw new NotFoundException(this.common.t('media.publication.not_found', lang));
    await this.common.company(user, p.companyId, lang);
    return p;
  }

  private async checkRefs(companyId: string, projectId: string | null | undefined, mediaFileIds: string[] | undefined, lang: string) {
    if (projectId) {
      const project = await this.m.findOne(MediaProject, { where: { id: projectId }, select: ['id', 'companyId'] });
      if (!project || project.companyId !== companyId) throw new BadRequestException(this.common.t('media.project_not_found', lang));
    }
    if (mediaFileIds?.length) {
      const ids: string[] = [...new Set<string>(mediaFileIds)];
      const n = await this.m.count(MediaFile, { where: { id: In(ids), companyId } });
      if (n !== ids.length) throw new BadRequestException(this.common.t('media.publication.media_file_invalid', lang));
    }
  }

  private cleanChannels(channels?: string[]): string[] | null {
    if (!channels) return null;
    const list = [...new Set(channels.map((c) => String(c).trim()).filter(Boolean))];
    return list.length ? list : null;
  }

  private async detail(id: string) {
    const p = await this.m.findOne(MediaPublication, { where: { id }, relations: ['createdBy', 'project'] });
    if (!p) return null;
    const files = p.mediaFileIds?.length ? await this.m.find(MediaFile, { where: { id: In(p.mediaFileIds) } }) : [];
    const history = await this.m.find(MediaPublicationStat, { where: { publicationId: id }, order: { statDate: 'ASC' } });
    const series = history.map((h, i) => {
      const prev = i > 0 ? history[i - 1] : null;
      return {
        date: day(h.statDate as any),
        views: h.views,
        likes: h.likes,
        comments: h.comments,
        shares: h.shares,
        gain: {
          views: h.views - (prev?.views ?? 0),
          likes: h.likes - (prev?.likes ?? 0),
          comments: h.comments - (prev?.comments ?? 0),
          shares: h.shares - (prev?.shares ?? 0),
        },
        note: h.note ?? null,
      };
    });
    return {
      ...p,
      createdBy: p.createdBy ? { id: p.createdBy.id, fullName: p.createdBy.fullName } : null,
      project: p.project ? { id: p.project.id, reference: p.project.reference, title: p.project.title } : null,
      interactions: interactions(p),
      mediaFiles: files,
      history: series,
    };
  }

  // ============================================================
  // PUBLICATIONS
  // ============================================================
  async create(dto: CreatePublicationDto, file: Express.Multer.File | undefined, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, dto.companyId, lang);
    await this.checkRefs(companyId, dto.projectId, dto.mediaFileIds, lang);
    const status = dto.status ?? MediaPublicationStatus.DRAFT;
    const coverUrl = (await this.cover(file)) ?? dto.coverUrl ?? null;
    const saved = await this.m.save(
      MediaPublication,
      this.m.create(MediaPublication, {
        companyId,
        projectId: dto.projectId ?? null,
        title: dto.title.trim(),
        description: dto.description ?? null,
        type: dto.type,
        channels: this.cleanChannels(dto.channels),
        mediaFileIds: dto.mediaFileIds?.length ? [...new Set<string>(dto.mediaFileIds)] : null,
        coverUrl,
        status,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : status === MediaPublicationStatus.PUBLISHED ? new Date() : null,
        notes: dto.notes ?? null,
        createdById: user.id,
      }),
    );
    return { message: this.common.t('media.publication.created', lang), data: await this.detail(saved.id) };
  }

  async update(id: string, dto: UpdatePublicationDto, file: Express.Multer.File | undefined, user: UserEntity, lang: string) {
    const p = await this.getPublication(id, user, lang);
    await this.checkRefs(p.companyId, dto.projectId, dto.mediaFileIds, lang);
    if (dto.title !== undefined) p.title = dto.title.trim();
    for (const f of ['projectId', 'description', 'type', 'notes'] as const) if (dto[f] !== undefined) (p as any)[f] = dto[f];
    if (dto.channels !== undefined) p.channels = this.cleanChannels(dto.channels);
    if (dto.mediaFileIds !== undefined) p.mediaFileIds = dto.mediaFileIds?.length ? [...new Set<string>(dto.mediaFileIds)] : null;
    if (dto.status !== undefined) {
      p.status = dto.status;
      if (dto.status === MediaPublicationStatus.PUBLISHED && !p.publishedAt) p.publishedAt = new Date();
    }
    if (dto.publishedAt !== undefined) p.publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : null;
    const uploaded = await this.cover(file);
    if (uploaded) {
      if (p.coverUrl) await this.files.deleteFileByUrl(p.coverUrl).catch(() => false);
      p.coverUrl = uploaded;
    } else if (dto.coverUrl !== undefined) p.coverUrl = dto.coverUrl || null;
    await this.m.save(MediaPublication, p);
    return { message: this.common.t('media.publication.updated', lang), data: await this.detail(id) };
  }

  async remove(id: string, user: UserEntity, lang: string) {
    const p = await this.getPublication(id, user, lang);
    await this.m.delete(MediaPublication, { id });
    if (p.coverUrl) await this.files.deleteFileByUrl(p.coverUrl).catch(() => false);
    return { message: this.common.t('media.publication.deleted', lang), data: { id } };
  }

  async findOne(id: string, user: UserEntity, lang: string) {
    await this.getPublication(id, user, lang);
    return { message: this.common.t('media.publication.detail', lang), data: await this.detail(id) };
  }

  async list(query: PublicationQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.m.createQueryBuilder(MediaPublication, 'p').where('p.companyId = :companyId', { companyId });
    if (query.projectId) qb.andWhere('p.projectId = :projectId', { projectId: query.projectId });
    if (query.status) qb.andWhere('p.status = :status', { status: query.status });
    if (query.type) qb.andWhere('p.type = :type', { type: query.type });
    if (query.channel) qb.andWhere('JSON_CONTAINS(p.channels, JSON_QUOTE(:channel))', { channel: query.channel.trim() });
    if (query.search?.trim()) {
      const kw = `%${query.search.trim()}%`;
      qb.andWhere(new Brackets((w) => w.where('p.title LIKE :kw', { kw }).orWhere('p.description LIKE :kw', { kw })));
    }
    const dateExpr = 'COALESCE(p.publishedAt, p.createdAt)';
    if (query.from) qb.andWhere(`${dateExpr} >= :from`, { from: new Date(`${day(query.from)}T00:00:00`) });
    if (query.to) qb.andWhere(`${dateExpr} < :to`, { to: new Date(`${addDays(day(query.to), 1)}T00:00:00`) });
    const [items, total] = await qb.orderBy(dateExpr, 'DESC').skip(skip).take(limit).getManyAndCount();
    return {
      message: this.common.t('media.publication.list', lang),
      data: new PaginatedResponseDto(items.map((p) => ({ ...p, interactions: interactions(p) })) as any, total, page, limit),
    };
  }

  /** Liste des lieux de diffusion déjà utilisés (pour proposer les mêmes libellés) */
  async channels(user: UserEntity, lang: string, companyIdParam?: string) {
    const companyId = await this.common.company(user, companyIdParam, lang);
    const rows = await this.m.find(MediaPublication, { where: { companyId }, select: ['id', 'channels'] });
    const count = new Map<string, number>();
    for (const r of rows) for (const c of r.channels ?? []) count.set(c, (count.get(c) ?? 0) + 1);
    return {
      message: this.common.t('media.publication.channels', lang),
      data: [...count.entries()].sort((a, b) => b[1] - a[1]).map(([channel, publications]) => ({ channel, publications })),
    };
  }

  // ============================================================
  // CHIFFRES SAISIS PAR L'ADMIN
  // ============================================================
  /**
   * Relevé : l'admin recopie les compteurs actuels (vues, j'aime, commentaires, partages) à une date.
   * Un relevé par jour (ressaisir la même date le remplace). Les chiffres affichés = dernier relevé.
   */
  async recordStats(id: string, dto: RecordPublicationStatsDto, user: UserEntity, lang: string) {
    const p = await this.getPublication(id, user, lang);
    const saved = await this.saveStats(p, dto, dto.date, user, lang);
    return { message: this.common.t('media.publication.stats_saved', lang), data: { stat: saved, publication: await this.detail(id) } };
  }

  async bulkStats(dto: BulkPublicationStatsDto, user: UserEntity, lang: string) {
    const ids: string[] = [...new Set<string>(dto.lines.map((l) => l.publicationId))];
    if (ids.length !== dto.lines.length) throw new BadRequestException(this.common.t('media.publication.duplicate_lines', lang));
    const pubs = await this.m.find(MediaPublication, { where: { id: In(ids) } });
    if (pubs.length !== ids.length) throw new NotFoundException(this.common.t('media.publication.not_found', lang));
    for (const companyId of new Set<string>(pubs.map((p) => p.companyId))) await this.common.company(user, companyId, lang);
    const out: MediaPublicationStat[] = [];
    for (const line of dto.lines) {
      const p = pubs.find((x) => x.id === line.publicationId)!;
      out.push(await this.saveStats(p, line, line.date ?? dto.date, user, lang));
    }
    return { message: this.common.t('media.publication.stats_bulk_saved', lang, { count: out.length }), data: out };
  }

  private async saveStats(p: MediaPublication, values: Partial<Counters> & { note?: string }, date: string | undefined, user: UserEntity, lang: string) {
    const statDate = day(date);
    if (statDate > today()) throw new BadRequestException(this.common.t('media.publication.future_date', lang));
    const previous = await this.m.findOne(MediaPublicationStat, {
      where: { publicationId: p.id, statDate: LessThanOrEqual(statDate) },
      order: { statDate: 'DESC' },
    });
    let row = await this.m.findOne(MediaPublicationStat, { where: { publicationId: p.id, statDate } });
    if (!row) {
      row = this.m.create(MediaPublicationStat, {
        companyId: p.companyId,
        publicationId: p.id,
        statDate,
        // Valeurs non saisies : on reprend le relevé précédent
        views: previous?.views ?? 0,
        likes: previous?.likes ?? 0,
        comments: previous?.comments ?? 0,
        shares: previous?.shares ?? 0,
      });
    }
    for (const k of METRICS) if (values[k] !== undefined) row[k] = Number(values[k]);
    if (values.note !== undefined) row.note = values.note || null;
    row.recordedById = user.id;
    const saved = await this.m.save(MediaPublicationStat, row);

    // Chiffres affichés = dernier relevé
    const latest = await this.m.findOne(MediaPublicationStat, { where: { publicationId: p.id }, order: { statDate: 'DESC' } });
    if (latest) {
      await this.m.update(MediaPublication, { id: p.id }, {
        views: latest.views,
        likes: latest.likes,
        comments: latest.comments,
        shares: latest.shares,
        lastStatsOn: day(latest.statDate as any),
        ...(p.status === MediaPublicationStatus.DRAFT ? { status: MediaPublicationStatus.PUBLISHED, publishedAt: p.publishedAt ?? new Date() } : {}),
      });
    }
    return saved;
  }

  async deleteStat(statId: string, user: UserEntity, lang: string) {
    const row = await this.m.findOne(MediaPublicationStat, { where: { id: statId } });
    if (!row) throw new NotFoundException(this.common.t('media.publication.stat_not_found', lang));
    await this.common.company(user, row.companyId, lang);
    await this.m.delete(MediaPublicationStat, { id: statId });
    const latest = await this.m.findOne(MediaPublicationStat, { where: { publicationId: row.publicationId }, order: { statDate: 'DESC' } });
    await this.m.update(MediaPublication, { id: row.publicationId }, {
      views: latest?.views ?? 0,
      likes: latest?.likes ?? 0,
      comments: latest?.comments ?? 0,
      shares: latest?.shares ?? 0,
      lastStatsOn: latest ? day(latest.statDate as any) : null,
    });
    return { message: this.common.t('media.publication.stat_deleted', lang), data: { id: statId } };
  }

  // ============================================================
  // RAPPORT & TABLEAU DE BORD
  // ============================================================
  /**
   * Rapport sur une période : ce qui a été gagné (vues, j'aime, commentaires, partages),
   * par publication, par lieu de diffusion, par type et jour par jour.
   */
  async report(query: PublicationReportQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, query.companyId, lang);
    const to = day(query.to);
    const from = query.from ? day(query.from) : addDays(to, -29);
    if (to < from) throw new BadRequestException(this.common.t('media.publication.invalid_period', lang));

    const qb = this.m.createQueryBuilder(MediaPublication, 'p').where('p.companyId = :companyId', { companyId });
    if (query.projectId) qb.andWhere('p.projectId = :projectId', { projectId: query.projectId });
    if (query.type) qb.andWhere('p.type = :type', { type: query.type });
    if (query.channel) qb.andWhere('JSON_CONTAINS(p.channels, JSON_QUOTE(:channel))', { channel: query.channel.trim() });
    const pubs = await qb.getMany();
    const ids = pubs.map((p) => p.id);
    const rows = ids.length
      ? await this.m.find(MediaPublicationStat, { where: { publicationId: In(ids), statDate: LessThanOrEqual(to) }, order: { statDate: 'ASC' } })
      : [];

    const byPub = new Map<string, MediaPublicationStat[]>();
    for (const r of rows) (byPub.get(r.publicationId) ?? byPub.set(r.publicationId, []).get(r.publicationId)!).push(r);

    const totals = zero();
    const daily = new Map<string, Counters>();
    const perPub: any[] = [];
    for (const p of pubs) {
      const list = byPub.get(p.id) ?? [];
      let prev: Counters = zero();
      const gain = zero();
      for (const r of list) {
        const d = day(r.statDate as any);
        const cur: Counters = { views: r.views, likes: r.likes, comments: r.comments, shares: r.shares };
        if (d >= from) {
          const g = daily.get(d) ?? zero();
          for (const k of METRICS) {
            const delta = cur[k] - prev[k];
            g[k] += delta;
            gain[k] += delta;
          }
          daily.set(d, g);
        }
        prev = cur;
      }
      for (const k of METRICS) totals[k] += gain[k];
      perPub.push({
        id: p.id,
        title: p.title,
        type: p.type,
        channels: p.channels ?? [],
        coverUrl: p.coverUrl ?? null,
        publishedAt: p.publishedAt,
        current: { views: p.views, likes: p.likes, comments: p.comments, shares: p.shares },
        period: { ...gain, interactions: interactions(gain) },
      });
    }

    const byChannel = new Map<string, Counters & { publications: number }>();
    const byType = new Map<string, Counters & { publications: number }>();
    for (const x of perPub) {
      for (const c of x.channels.length ? x.channels : ['—']) {
        const acc = byChannel.get(c) ?? { ...zero(), publications: 0 };
        acc.publications++;
        for (const k of METRICS) acc[k] += x.period[k];
        byChannel.set(c, acc);
      }
      const t = byType.get(x.type) ?? { ...zero(), publications: 0 };
      t.publications++;
      for (const k of METRICS) t[k] += x.period[k];
      byType.set(x.type, t);
    }

    const series: any[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) series.push({ date: d, ...(daily.get(d) ?? zero()) });

    const publishedInPeriod = pubs.filter((p) => p.publishedAt && day(p.publishedAt) >= from && day(p.publishedAt) <= to).length;
    return {
      message: this.common.t('media.publication.report', lang),
      data: {
        period: { from, to },
        totals: { ...totals, interactions: interactions(totals), publications: pubs.length, publishedInPeriod },
        byChannel: [...byChannel.entries()].map(([channel, v]) => ({ channel, ...v })).sort((a, b) => b.views - a.views),
        byType: [...byType.entries()].map(([type, v]) => ({ type, ...v })),
        daily: series,
        topPublications: perPub
          .sort((a, b) => b.period.views - a.period.views || b.period.interactions - a.period.interactions)
          .slice(0, query.top ?? 10),
      },
    };
  }

  async dashboard(user: UserEntity, lang: string, companyIdParam?: string) {
    const companyId = await this.common.company(user, companyIdParam, lang);
    const [byStatus, totals, top, stale] = await Promise.all([
      this.m.createQueryBuilder(MediaPublication, 'p').select('p.status', 'status').addSelect('COUNT(*)', 'count').where('p.companyId = :companyId', { companyId }).groupBy('p.status').getRawMany(),
      this.m
        .createQueryBuilder(MediaPublication, 'p')
        .select('COALESCE(SUM(p.views), 0)', 'views')
        .addSelect('COALESCE(SUM(p.likes), 0)', 'likes')
        .addSelect('COALESCE(SUM(p.comments), 0)', 'comments')
        .addSelect('COALESCE(SUM(p.shares), 0)', 'shares')
        .where('p.companyId = :companyId AND p.status != :draft', { companyId, draft: MediaPublicationStatus.DRAFT })
        .getRawOne(),
      this.m.find(MediaPublication, { where: { companyId, status: MediaPublicationStatus.PUBLISHED }, order: { views: 'DESC' }, take: 5 }),
      // Publications en ligne sans chiffres depuis 7 jours (à mettre à jour)
      this.m
        .createQueryBuilder(MediaPublication, 'p')
        .where('p.companyId = :companyId AND p.status = :pub', { companyId, pub: MediaPublicationStatus.PUBLISHED })
        .andWhere('(p.lastStatsOn IS NULL OR p.lastStatsOn < :limit)', { limit: addDays(today(), -7) })
        .orderBy('p.publishedAt', 'DESC')
        .take(20)
        .getMany(),
    ]);
    const t: Counters = { views: Number(totals?.views || 0), likes: Number(totals?.likes || 0), comments: Number(totals?.comments || 0), shares: Number(totals?.shares || 0) };
    const last7 = await this.report({ companyId, from: addDays(today(), -6), to: today() } as PublicationReportQueryDto, user, lang);
    return {
      message: this.common.t('media.publication.dashboard', lang),
      data: {
        publications: Object.fromEntries(Object.values(MediaPublicationStatus).map((s) => [s, Number(byStatus.find((r) => r.status === s)?.count || 0)])),
        totals: { ...t, interactions: interactions(t) },
        last7Days: last7.data.daily,
        top,
        toUpdate: stale,
      },
    };
  }
}
