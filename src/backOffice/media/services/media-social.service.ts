import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, EntityManager, In } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { NotificationType } from 'src/notification/type/notification.type';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { pageParams } from 'src/backOffice/logistics/common/logistics-access';
import {
  SOCIAL_POST_TRANSITIONS,
  SocialPostStatus,
  SocialPostType,
  SocialStatsMode,
  SocialTargetStatus,
} from '../media.enums';
import { SocialAccount } from '../entities/social-account.entity';
import { SocialPost } from '../entities/social-post.entity';
import { SocialPostTarget } from '../entities/social-post-target.entity';
import { SocialPostDailyStat } from '../entities/social-post-daily-stat.entity';
import { SocialAccountDailyStat } from '../entities/social-account-daily-stat.entity';
import { MediaFile } from '../entities/media-file.entity';
import { MediaProject } from '../entities/media-project.entity';
import {
  AddPostTargetsDto,
  BulkPostStatsDto,
  CreateSocialAccountDto,
  CreateSocialPostDto,
  PublishTargetDto,
  RecordAccountStatsDto,
  RecordPostStatsDto,
  SocialAccountQueryDto,
  SocialCalendarQueryDto,
  SocialPostQueryDto,
  SocialPostStatusDto,
  SocialReportQueryDto,
  SocialStatsQueryDto,
  UpdateSocialAccountDto,
  UpdateSocialPostDto,
  UpdateTargetDto,
} from '../dto/social.dto';
import { MediaCommonService } from './media-common.service';

/** Indicateurs d'une publication (j'aime, commentaires, partages…) */
export const POST_METRICS = ['likes', 'comments', 'shares', 'saves', 'views', 'reach', 'impressions', 'clicks'] as const;
type PostMetric = (typeof POST_METRICS)[number];
type Metrics = Record<PostMetric, number>;

const TZ = process.env.COMPANY_DEFAULT_TIMEZONE || 'Africa/Lubumbashi';

/** Jour local (YYYY-MM-DD) dans le fuseau de l'entreprise */
function localDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function dayOf(value?: string | null): string {
  if (!value) return localDay();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDay(new Date(value));
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function zeroMetrics(): Metrics {
  return POST_METRICS.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as Metrics);
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Interactions = j'aime + commentaires + partages + enregistrements */
function engagementOf(m: Partial<Metrics>): number {
  return num(m.likes) + num(m.comments) + num(m.shares) + num(m.saves);
}

function rate(engagement: number, reach: number): number {
  return reach > 0 ? Math.round((engagement / reach) * 10000) / 100 : 0;
}

function cleanTags(tags?: string[] | null): string[] | null {
  if (!tags) return null;
  const list = [...new Set(tags.map((t) => String(t).trim().replace(/^#+/, '')).filter(Boolean).map((t) => `#${t}`))];
  return list.length ? list : null;
}

/**
 * Réseaux sociaux : comptes gérés, publications (ce qu'on poste, où, quand),
 * validation, statistiques journalières (j'aime, commentaires, partages, vues…) et rapports.
 * La publication sur les réseaux est faite par l'équipe ; ici on planifie, on trace et on mesure.
 */
@Injectable()
export class MediaSocialService {
  constructor(private readonly common: MediaCommonService) { }

  private get m() {
    return this.common.dataSource.manager;
  }

  // ============================================================
  // COMPTES / PAGES
  // ============================================================
  private async getAccount(id: string, user: UserEntity, lang: string, m: EntityManager = this.m): Promise<SocialAccount> {
    const account = await m.findOne(SocialAccount, { where: { id } });
    if (!account) throw new NotFoundException(this.common.t('media.social.account_not_found', lang));
    await this.common.company(user, account.companyId, lang);
    return account;
  }

  private async checkProject(projectId: string | null | undefined, companyId: string, lang: string) {
    if (!projectId) return;
    const project = await this.m.findOne(MediaProject, { where: { id: projectId }, select: ['id', 'companyId'] });
    if (!project || project.companyId !== companyId) throw new BadRequestException(this.common.t('media.project_not_found', lang));
  }

  private async checkManager(managerId: string | null | undefined, companyId: string, lang: string) {
    if (!managerId) return;
    if (!(await this.common.isMember(managerId, companyId))) {
      throw new BadRequestException(this.common.t('media.social.manager_not_member', lang));
    }
  }

  async createAccount(dto: CreateSocialAccountDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, dto.companyId, lang);
    await this.checkProject(dto.projectId, companyId, lang);
    await this.checkManager(dto.managerId, companyId, lang);
    const handle = dto.handle?.trim() || null;
    if (handle) {
      const dup = await this.m.findOne(SocialAccount, { where: { companyId, platform: dto.platform, handle } });
      if (dup) throw new BadRequestException(this.common.t('media.social.account_exists', lang));
    }
    const account = this.m.create(SocialAccount, {
      companyId,
      platform: dto.platform,
      name: dto.name.trim(),
      handle,
      url: dto.url ?? null,
      projectId: dto.projectId ?? null,
      clientName: dto.clientName ?? null,
      managerId: dto.managerId ?? null,
      followers: dto.followers ?? 0,
      followersUpdatedOn: dto.followers !== undefined ? localDay() : null,
      notes: dto.notes ?? null,
      isActive: true,
    });
    return { message: this.common.t('media.social.account_created', lang), data: await this.m.save(SocialAccount, account) };
  }

  async listAccounts(query: SocialAccountQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, query.companyId, lang);
    const qb = this.m
      .createQueryBuilder(SocialAccount, 'a')
      .leftJoin('a.manager', 'mg')
      .addSelect(['mg.id', 'mg.fullName'])
      .where('a.companyId = :companyId', { companyId });
    if (query.platform) qb.andWhere('a.platform = :platform', { platform: query.platform });
    if (query.projectId) qb.andWhere('a.projectId = :projectId', { projectId: query.projectId });
    if (query.managerId) qb.andWhere('a.managerId = :managerId', { managerId: query.managerId });
    if (query.isActive !== undefined) qb.andWhere('a.isActive = :isActive', { isActive: query.isActive });
    if (query.search) {
      const s = `%${query.search.trim()}%`;
      qb.andWhere(new Brackets((w) => w.where('a.name LIKE :s', { s }).orWhere('a.handle LIKE :s', { s }).orWhere('a.clientName LIKE :s', { s })));
    }
    const accounts = await qb.orderBy('a.platform', 'ASC').addOrderBy('a.name', 'ASC').getMany();

    // Publications et interactions cumulées par compte
    const ids = accounts.map((a) => a.id);
    const totals = ids.length
      ? await this.m
        .createQueryBuilder(SocialPostTarget, 't')
        .select('t.accountId', 'accountId')
        .addSelect("SUM(CASE WHEN t.status = 'PUBLISHED' THEN 1 ELSE 0 END)", 'published')
        .addSelect('SUM(t.likes)', 'likes')
        .addSelect('SUM(t.comments)', 'comments')
        .addSelect('SUM(t.shares)', 'shares')
        .addSelect('SUM(t.views)', 'views')
        .where('t.accountId IN (:...ids)', { ids })
        .groupBy('t.accountId')
        .getRawMany()
      : [];
    const byId = new Map(totals.map((r) => [r.accountId, r]));
    const data = accounts.map((a) => {
      const r: any = byId.get(a.id) || {};
      return {
        ...a,
        stats: { published: num(r.published), likes: num(r.likes), comments: num(r.comments), shares: num(r.shares), views: num(r.views) },
      };
    });
    return { message: this.common.t('media.social.accounts', lang), data };
  }

  async getAccountDetails(id: string, user: UserEntity, lang: string) {
    const account = await this.getAccount(id, user, lang);
    const since = addDays(localDay(), -29);
    const history = await this.m
      .createQueryBuilder(SocialAccountDailyStat, 's')
      .where('s.accountId = :id AND s.statDate >= :since', { id, since })
      .orderBy('s.statDate', 'ASC')
      .getMany();
    return { message: this.common.t('media.social.account', lang), data: { ...account, last30Days: history } };
  }

  async updateAccount(id: string, dto: UpdateSocialAccountDto, user: UserEntity, lang: string) {
    const account = await this.getAccount(id, user, lang);
    if (dto.projectId !== undefined) await this.checkProject(dto.projectId, account.companyId, lang);
    if (dto.managerId !== undefined) await this.checkManager(dto.managerId, account.companyId, lang);
    const fields: (keyof UpdateSocialAccountDto)[] = ['name', 'handle', 'url', 'projectId', 'clientName', 'managerId', 'notes', 'isActive'];
    for (const f of fields) if (dto[f] !== undefined) (account as any)[f] = dto[f];
    if (dto.followers !== undefined) {
      account.followers = dto.followers;
      account.followersUpdatedOn = localDay();
    }
    // La plateforme d'un compte ne change pas (les publications y sont rattachées)
    return { message: this.common.t('media.social.account_updated', lang), data: await this.m.save(SocialAccount, account) };
  }

  async deleteAccount(id: string, user: UserEntity, lang: string) {
    const account = await this.getAccount(id, user, lang);
    const used = await this.m.count(SocialPostTarget, { where: { accountId: id } });
    if (used > 0) {
      // Historique conservé : on désactive au lieu de supprimer
      account.isActive = false;
      await this.m.save(SocialAccount, account);
      return { message: this.common.t('media.social.account_deactivated', lang), data: account };
    }
    await this.m.delete(SocialAccount, { id });
    return { message: this.common.t('media.social.account_deleted', lang), data: { id } };
  }

  /** Relevé journalier d'un compte (abonnés, portée, visites…) */
  async recordAccountStats(id: string, dto: RecordAccountStatsDto, user: UserEntity, lang: string) {
    const account = await this.getAccount(id, user, lang);
    const statDate = dayOf(dto.date);
    if (statDate > localDay()) throw new BadRequestException(this.common.t('media.social.future_date', lang));

    return this.common.dataSource.transaction(async (m) => {
      const previous = await m
        .createQueryBuilder(SocialAccountDailyStat, 's')
        .where('s.accountId = :id AND s.statDate < :d', { id, d: statDate })
        .orderBy('s.statDate', 'DESC')
        .getOne();
      let row = await m.findOne(SocialAccountDailyStat, { where: { accountId: id, statDate } });
      if (!row) row = m.create(SocialAccountDailyStat, { companyId: account.companyId, accountId: id, platform: account.platform, statDate });

      if (dto.followers !== undefined) row.followers = dto.followers;
      else if (!row.id) row.followers = previous?.followers ?? account.followers ?? 0;
      if (dto.newFollowers !== undefined) row.newFollowers = dto.newFollowers;
      else if (dto.followers !== undefined && previous) row.newFollowers = dto.followers - previous.followers;
      for (const k of ['reach', 'impressions', 'profileViews', 'messages'] as const) {
        if (dto[k] !== undefined) row[k] = dto[k] as number;
      }
      row.recordedById = user.id;
      const saved = await m.save(SocialAccountDailyStat, row);

      if (dto.followers !== undefined && (!account.followersUpdatedOn || statDate >= account.followersUpdatedOn)) {
        await m.update(SocialAccount, { id }, { followers: dto.followers, followersUpdatedOn: statDate });
      }
      return { message: this.common.t('media.social.stats_saved', lang), data: saved };
    });
  }

  async accountStats(id: string, query: SocialStatsQueryDto, user: UserEntity, lang: string) {
    const account = await this.getAccount(id, user, lang);
    const to = dayOf(query.to);
    const from = query.from ? dayOf(query.from) : addDays(to, -29);
    const days = await this.m
      .createQueryBuilder(SocialAccountDailyStat, 's')
      .where('s.accountId = :id AND s.statDate BETWEEN :from AND :to', { id, from, to })
      .orderBy('s.statDate', 'ASC')
      .getMany();
    const interactions = await this.dailySeries({ accountId: id }, account.companyId, from, to);
    return {
      message: this.common.t('media.social.account_stats', lang),
      data: {
        account: { id: account.id, name: account.name, platform: account.platform, followers: account.followers },
        from,
        to,
        newFollowers: days.reduce((s, d) => s + num(d.newFollowers), 0),
        audience: days,
        interactions,
      },
    };
  }

  // ============================================================
  // PUBLICATIONS
  // ============================================================
  private async getPost(id: string, user: UserEntity, lang: string, m: EntityManager = this.m): Promise<SocialPost> {
    const post = await m.findOne(SocialPost, { where: { id } });
    if (!post) throw new NotFoundException(this.common.t('media.social.post_not_found', lang));
    await this.common.company(user, post.companyId, lang);
    return post;
  }

  private async checkMediaFiles(ids: string[] | undefined, companyId: string, lang: string) {
    if (!ids?.length) return;
    const unique = [...new Set(ids)];
    const count = await this.m.count(MediaFile, { where: { id: In(unique), companyId } });
    if (count !== unique.length) throw new BadRequestException(this.common.t('media.social.media_file_invalid', lang));
  }

  private async activeAccounts(ids: string[], companyId: string, lang: string, m: EntityManager = this.m): Promise<SocialAccount[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const accounts = await m.find(SocialAccount, { where: { id: In(unique), companyId } });
    if (accounts.length !== unique.length) throw new BadRequestException(this.common.t('media.social.account_not_found', lang));
    const inactive = accounts.find((a) => !a.isActive);
    if (inactive) throw new BadRequestException(this.common.t('media.social.account_inactive', lang, { name: inactive.name }));
    return accounts;
  }

  async createPost(dto: CreateSocialPostDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, dto.companyId, lang);
    await this.checkProject(dto.projectId, companyId, lang);
    await this.checkMediaFiles(dto.mediaFileIds, companyId, lang);
    const accounts = await this.activeAccounts(dto.accountIds ?? [], companyId, lang);

    const id = await this.common.dataSource.transaction(async (m) => {
      const post = await m.save(
        SocialPost,
        m.create(SocialPost, {
          companyId,
          projectId: dto.projectId ?? null,
          title: dto.title.trim(),
          caption: dto.caption ?? null,
          hashtags: cleanTags(dto.hashtags),
          type: dto.type ?? SocialPostType.IMAGE,
          mediaFileIds: dto.mediaFileIds?.length ? [...new Set<string>(dto.mediaFileIds)] : null,
          link: dto.link ?? null,
          campaign: dto.campaign?.trim() || null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          notes: dto.notes ?? null,
          status: SocialPostStatus.DRAFT,
          createdById: user.id,
        }),
      );
      if (accounts.length) {
        await m.insert(
          SocialPostTarget,
          accounts.map((a) => ({ postId: post.id, accountId: a.id, platform: a.platform, status: SocialTargetStatus.PLANNED })),
        );
      }
      return post.id;
    });
    return { message: this.common.t('media.social.post_created', lang), data: await this.loadPost(id) };
  }

  private async loadPost(id: string) {
    const post = await this.m
      .createQueryBuilder(SocialPost, 'p')
      .leftJoinAndSelect('p.targets', 't')
      .leftJoin('t.account', 'a')
      .addSelect(['a.id', 'a.name', 'a.handle', 'a.platform', 'a.url', 'a.followers'])
      .leftJoin('p.createdBy', 'cb')
      .addSelect(['cb.id', 'cb.fullName'])
      .where('p.id = :id', { id })
      .getOne();
    if (!post) return null;
    const files = post.mediaFileIds?.length ? await this.m.find(MediaFile, { where: { id: In(post.mediaFileIds) } }) : [];
    const totals = zeroMetrics();
    for (const t of post.targets || []) for (const k of POST_METRICS) totals[k] += num(t[k]);
    const engagement = engagementOf(totals);
    return {
      ...post,
      mediaFiles: files,
      totals: { ...totals, engagement, engagementRate: rate(engagement, totals.reach) },
    };
  }

  async getPostDetails(id: string, user: UserEntity, lang: string) {
    await this.getPost(id, user, lang);
    return { message: this.common.t('media.social.post', lang), data: await this.loadPost(id) };
  }

  async listPosts(query: SocialPostQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.m
      .createQueryBuilder(SocialPost, 'p')
      .leftJoinAndSelect('p.targets', 't')
      .leftJoin('t.account', 'a')
      .addSelect(['a.id', 'a.name', 'a.handle', 'a.platform'])
      .where('p.companyId = :companyId', { companyId });
    if (query.projectId) qb.andWhere('p.projectId = :projectId', { projectId: query.projectId });
    if (query.status) qb.andWhere('p.status = :status', { status: query.status });
    if (query.type) qb.andWhere('p.type = :type', { type: query.type });
    if (query.campaign) qb.andWhere('p.campaign = :campaign', { campaign: query.campaign });
    if (query.accountId || query.platform) {
      const sub = this.m.createQueryBuilder(SocialPostTarget, 'ft').select('ft.postId');
      if (query.accountId) sub.andWhere('ft.accountId = :accountId');
      if (query.platform) sub.andWhere('ft.platform = :platform');
      qb.andWhere(`p.id IN (${sub.getQuery()})`, { accountId: query.accountId, platform: query.platform });
    }
    if (query.search) {
      const s = `%${query.search.trim()}%`;
      qb.andWhere(new Brackets((w) => w.where('p.title LIKE :s', { s }).orWhere('p.caption LIKE :s', { s }).orWhere('p.campaign LIKE :s', { s })));
    }
    const dateExpr = 'COALESCE(p.publishedAt, p.scheduledAt, p.createdAt)';
    if (query.from) qb.andWhere(`${dateExpr} >= :from`, { from: new Date(`${dayOf(query.from)}T00:00:00`) });
    if (query.to) qb.andWhere(`${dateExpr} < :to`, { to: new Date(`${addDays(dayOf(query.to), 1)}T00:00:00`) });

    const [items, total] = await qb.orderBy(dateExpr, 'DESC').skip(skip).take(limit).getManyAndCount();
    const data = items.map((p) => {
      const totals = zeroMetrics();
      for (const t of p.targets || []) for (const k of POST_METRICS) totals[k] += num(t[k]);
      const engagement = engagementOf(totals);
      return { ...p, totals: { ...totals, engagement, engagementRate: rate(engagement, totals.reach) } };
    });
    return { message: this.common.t('media.social.posts', lang), data: new PaginatedResponseDto(data, total, page, limit) };
  }

  /** Calendrier éditorial : publications programmées / publiées sur la période */
  async calendar(query: SocialCalendarQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, query.companyId, lang);
    const from = dayOf(query.from);
    const to = dayOf(query.to);
    if (to < from) throw new BadRequestException(this.common.t('media.social.invalid_period', lang));
    const qb = this.m
      .createQueryBuilder(SocialPost, 'p')
      .leftJoinAndSelect('p.targets', 't')
      .leftJoin('t.account', 'a')
      .addSelect(['a.id', 'a.name', 'a.platform'])
      .where('p.companyId = :companyId', { companyId })
      .andWhere('p.status <> :cancelled', { cancelled: SocialPostStatus.CANCELLED })
      .andWhere('COALESCE(p.publishedAt, p.scheduledAt) >= :from AND COALESCE(p.publishedAt, p.scheduledAt) < :to', {
        from: new Date(`${from}T00:00:00`),
        to: new Date(`${addDays(to, 1)}T00:00:00`),
      });
    if (query.projectId) qb.andWhere('p.projectId = :projectId', { projectId: query.projectId });
    if (query.platform) qb.andWhere('t.platform = :platform', { platform: query.platform });
    const posts = await qb.orderBy('COALESCE(p.publishedAt, p.scheduledAt)', 'ASC').getMany();

    const days: Record<string, any[]> = {};
    for (const p of posts) {
      const when = p.publishedAt ?? p.scheduledAt;
      if (!when) continue;
      const key = localDay(new Date(when));
      (days[key] ||= []).push({
        id: p.id,
        title: p.title,
        type: p.type,
        status: p.status,
        campaign: p.campaign,
        at: when,
        platforms: [...new Set((p.targets || []).map((t) => t.platform))],
      });
    }
    return { message: this.common.t('media.social.calendar', lang), data: { from, to, total: posts.length, days } };
  }

  async updatePost(id: string, dto: UpdateSocialPostDto, user: UserEntity, lang: string) {
    const post = await this.getPost(id, user, lang);
    if ([SocialPostStatus.PUBLISHED, SocialPostStatus.CANCELLED].includes(post.status)) {
      // Après publication, seules les notes et la campagne restent modifiables
      const allowed = ['notes', 'campaign'];
      const touched = Object.keys(dto).filter((k) => (dto as any)[k] !== undefined && !allowed.includes(k));
      if (touched.length) throw new BadRequestException(this.common.t('media.social.post_locked', lang));
    }
    if (dto.projectId !== undefined) await this.checkProject(dto.projectId, post.companyId, lang);
    if (dto.mediaFileIds !== undefined) await this.checkMediaFiles(dto.mediaFileIds, post.companyId, lang);

    for (const f of ['projectId', 'caption', 'type', 'link', 'notes'] as const) {
      if (dto[f] !== undefined) (post as any)[f] = dto[f];
    }
    if (dto.title !== undefined) post.title = dto.title.trim();
    if (dto.campaign !== undefined) post.campaign = dto.campaign?.trim() || null;
    if (dto.hashtags !== undefined) post.hashtags = cleanTags(dto.hashtags);
    if (dto.mediaFileIds !== undefined) post.mediaFileIds = dto.mediaFileIds?.length ? [...new Set<string>(dto.mediaFileIds)] : null;
    if (dto.scheduledAt !== undefined) post.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    // Un contenu modifié après validation repasse en brouillon
    if (post.status === SocialPostStatus.APPROVED && (dto.caption !== undefined || dto.mediaFileIds !== undefined || dto.title !== undefined)) {
      post.status = SocialPostStatus.DRAFT;
      post.approvedById = null;
      post.approvedAt = null;
    }

    await this.common.dataSource.transaction(async (m) => {
      await m.save(SocialPost, post);
      if (dto.accountIds !== undefined) await this.syncTargets(post, dto.accountIds ?? [], lang, m);
    });
    return { message: this.common.t('media.social.post_updated', lang), data: await this.loadPost(id) };
  }

  /** Remplace les plateformes prévues (les plateformes déjà publiées sont conservées) */
  private async syncTargets(post: SocialPost, accountIds: string[], lang: string, m: EntityManager) {
    const wanted = new Set(accountIds);
    const current = await m.find(SocialPostTarget, { where: { postId: post.id } });
    const removable = current.filter((t) => !wanted.has(t.accountId) && t.status === SocialTargetStatus.PLANNED);
    if (removable.length) await m.delete(SocialPostTarget, { id: In(removable.map((t) => t.id)) });
    const existing = new Set(current.map((t) => t.accountId));
    const toAdd = [...wanted].filter((a) => !existing.has(a));
    const accounts = await this.activeAccounts(toAdd, post.companyId, lang, m);
    if (accounts.length) {
      await m.insert(
        SocialPostTarget,
        accounts.map((a) => ({ postId: post.id, accountId: a.id, platform: a.platform, status: SocialTargetStatus.PLANNED })),
      );
    }
  }

  async changeStatus(id: string, dto: SocialPostStatusDto, user: UserEntity, lang: string) {
    const post = await this.getPost(id, user, lang);
    const from = post.status;
    const to = dto.status;
    if (from === to) return { message: this.common.t('media.social.post_status_updated', lang), data: await this.loadPost(id) };
    if (!SOCIAL_POST_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(this.common.t('media.social.invalid_transition', lang, { from, to }));
    }
    const targets = await this.m.find(SocialPostTarget, { where: { postId: id } });
    if ([SocialPostStatus.PENDING_APPROVAL, SocialPostStatus.APPROVED, SocialPostStatus.SCHEDULED, SocialPostStatus.PUBLISHED].includes(to) && !targets.length) {
      throw new BadRequestException(this.common.t('media.social.no_platform', lang));
    }
    if (to === SocialPostStatus.SCHEDULED) {
      const at = dto.scheduledAt ? new Date(dto.scheduledAt) : post.scheduledAt;
      if (!at) throw new BadRequestException(this.common.t('media.social.schedule_required', lang));
      post.scheduledAt = at;
    }
    if (to === SocialPostStatus.APPROVED) {
      post.approvedById = user.id;
      post.approvedAt = new Date();
    }
    if (to === SocialPostStatus.DRAFT) {
      post.approvedById = null;
      post.approvedAt = null;
    }
    if (dto.note) post.notes = dto.note;
    post.status = to;

    await this.common.dataSource.transaction(async (m) => {
      if (to === SocialPostStatus.PUBLISHED) {
        const now = new Date();
        post.publishedAt = post.publishedAt ?? now;
        await m.update(
          SocialPostTarget,
          { postId: id, status: SocialTargetStatus.PLANNED },
          { status: SocialTargetStatus.PUBLISHED, publishedAt: post.publishedAt },
        );
      }
      await m.save(SocialPost, post);
    });

    await this.notifyStatus(post, from, to, targets, user, lang);
    return { message: this.common.t('media.social.post_status_updated', lang), data: await this.loadPost(id) };
  }

  /** Validation : les responsables des comptes sont prévenus ; le rédacteur reçoit la décision */
  private async notifyStatus(post: SocialPost, from: SocialPostStatus, to: SocialPostStatus, targets: SocialPostTarget[], user: UserEntity, lang: string) {
    const data = { postId: post.id, status: to, kind: 'social_post' };
    if (to === SocialPostStatus.PENDING_APPROVAL) {
      const accounts = await this.m.find(SocialAccount, { where: { id: In(targets.map((t) => t.accountId)) }, select: ['id', 'managerId'] });
      const ids = accounts.map((a) => a.managerId).filter((x): x is string => !!x && x !== user.id);
      await this.common.notifyUsers(ids, 'social_approval', { title: post.title }, data, NotificationType.MEDIA_PROJECT_UPDATE, lang);
      return;
    }
    if (!post.createdById || post.createdById === user.id) return;
    if (to === SocialPostStatus.APPROVED) {
      await this.common.notifyUsers([post.createdById], 'social_approved', { title: post.title }, data, NotificationType.MEDIA_PROJECT_UPDATE, lang);
    } else if (from === SocialPostStatus.PENDING_APPROVAL && (to === SocialPostStatus.DRAFT || to === SocialPostStatus.CANCELLED)) {
      await this.common.notifyUsers([post.createdById], 'social_rejected', { title: post.title }, data, NotificationType.MEDIA_PROJECT_UPDATE, lang);
    }
  }

  async deletePost(id: string, user: UserEntity, lang: string) {
    await this.getPost(id, user, lang);
    const stats = await this.m.count(SocialPostDailyStat, { where: { postId: id } });
    if (stats > 0) throw new BadRequestException(this.common.t('media.social.post_has_stats', lang));
    await this.m.delete(SocialPost, { id });
    return { message: this.common.t('media.social.post_deleted', lang), data: { id } };
  }

  // ============================================================
  // PLATEFORMES D'UNE PUBLICATION
  // ============================================================
  private async getTarget(targetId: string, user: UserEntity, lang: string, m: EntityManager = this.m) {
    const target = await m.findOne(SocialPostTarget, { where: { id: targetId }, relations: ['post'] });
    if (!target) throw new NotFoundException(this.common.t('media.social.target_not_found', lang));
    await this.common.company(user, target.post.companyId, lang);
    return target;
  }

  async addTargets(postId: string, dto: AddPostTargetsDto, user: UserEntity, lang: string) {
    const post = await this.getPost(postId, user, lang);
    if (post.status === SocialPostStatus.CANCELLED) throw new BadRequestException(this.common.t('media.social.post_locked', lang));
    const current = await this.m.find(SocialPostTarget, { where: { postId }, select: ['id', 'accountId'] });
    const existing = new Set(current.map((t) => t.accountId));
    const accounts = await this.activeAccounts(dto.accountIds.filter((a) => !existing.has(a)), post.companyId, lang);
    if (accounts.length) {
      await this.m.insert(
        SocialPostTarget,
        accounts.map((a) => ({ postId, accountId: a.id, platform: a.platform, status: SocialTargetStatus.PLANNED })),
      );
    }
    return { message: this.common.t('media.social.targets_added', lang, { count: accounts.length }), data: await this.loadPost(postId) };
  }

  async removeTarget(targetId: string, user: UserEntity, lang: string) {
    const target = await this.getTarget(targetId, user, lang);
    if (target.status !== SocialTargetStatus.PLANNED) throw new BadRequestException(this.common.t('media.social.target_published', lang));
    await this.m.delete(SocialPostTarget, { id: targetId });
    return { message: this.common.t('media.social.target_removed', lang), data: { id: targetId } };
  }

  /** Marque la publication comme publiée sur cette plateforme (avec le lien du post) */
  async publishTarget(targetId: string, dto: PublishTargetDto, user: UserEntity, lang: string) {
    const target = await this.getTarget(targetId, user, lang);
    if (target.post.status === SocialPostStatus.CANCELLED) throw new BadRequestException(this.common.t('media.social.post_locked', lang));
    const at = dto.publishedAt ? new Date(dto.publishedAt) : new Date();
    if (at.getTime() > Date.now() + 5 * 60 * 1000) throw new BadRequestException(this.common.t('media.social.future_date', lang));

    await this.common.dataSource.transaction(async (m) => {
      await m.update(
        SocialPostTarget,
        { id: targetId },
        {
          status: SocialTargetStatus.PUBLISHED,
          publishedAt: at,
          postUrl: dto.postUrl ?? target.postUrl ?? null,
          externalId: dto.externalId ?? target.externalId ?? null,
          note: dto.note ?? target.note ?? null,
        },
      );
      const post = target.post;
      if (post.status !== SocialPostStatus.PUBLISHED) {
        await m.update(SocialPost, { id: post.id }, { status: SocialPostStatus.PUBLISHED, publishedAt: post.publishedAt ?? at });
      } else if (!post.publishedAt || at < new Date(post.publishedAt)) {
        await m.update(SocialPost, { id: post.id }, { publishedAt: at });
      }
    });
    return { message: this.common.t('media.social.target_published_ok', lang), data: await this.loadPost(target.postId) };
  }

  async updateTarget(targetId: string, dto: UpdateTargetDto, user: UserEntity, lang: string) {
    const target = await this.getTarget(targetId, user, lang);
    const patch: Partial<SocialPostTarget> = {};
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.publishedAt !== undefined) patch.publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : null;
    if (dto.postUrl !== undefined) patch.postUrl = dto.postUrl;
    if (dto.externalId !== undefined) patch.externalId = dto.externalId;
    if (dto.boostSpent !== undefined) patch.boostSpent = dto.boostSpent;
    if (dto.note !== undefined) patch.note = dto.note;
    if (patch.status === SocialTargetStatus.PUBLISHED && !patch.publishedAt && !target.publishedAt) patch.publishedAt = new Date();
    if (Object.keys(patch).length) await this.m.update(SocialPostTarget, { id: targetId }, patch);
    return { message: this.common.t('media.social.target_updated', lang), data: await this.loadPost(target.postId) };
  }

  // ============================================================
  // STATISTIQUES JOURNALIÈRES DES PUBLICATIONS
  // ============================================================
  /**
   * Enregistre les chiffres d'une journée.
   * DAILY : valeurs gagnées ce jour-là. TOTAL : compteurs affichés par le réseau,
   * le gain du jour est calculé (total − somme des jours précédents).
   * Les totaux de la plateforme sont ensuite recalculés.
   */
  async recordPostStats(targetId: string, dto: RecordPostStatsDto, user: UserEntity, lang: string) {
    const target = await this.getTarget(targetId, user, lang);
    const data = await this.common.dataSource.transaction((m) => this.saveStats(target, dto, dto.mode, dto.date, user, lang, m));
    return { message: this.common.t('media.social.stats_saved', lang), data };
  }

  /** Saisie groupée (ex. tous les posts du jour en une fois) */
  async bulkPostStats(dto: BulkPostStatsDto, user: UserEntity, lang: string) {
    const ids: string[] = [...new Set<string>(dto.lines.map((l) => l.targetId))];
    if (ids.length !== dto.lines.length) throw new BadRequestException(this.common.t('media.social.duplicate_lines', lang));
    const targets: SocialPostTarget[] = await this.m.find(SocialPostTarget, { where: { id: In(ids) }, relations: ['post'] });
    if (targets.length !== ids.length) throw new NotFoundException(this.common.t('media.social.target_not_found', lang));
    for (const companyId of new Set<string>(targets.map((t) => t.post.companyId))) await this.common.company(user, companyId, lang);
    const byId = new Map<string, SocialPostTarget>(targets.map((t) => [t.id, t] as [string, SocialPostTarget]));

    const saved = await this.common.dataSource.transaction(async (m) => {
      const out: any[] = [];
      for (const line of dto.lines) {
        const target = byId.get(line.targetId)!;
        out.push(await this.saveStats(target, line, line.mode ?? dto.mode, line.date ?? dto.date, user, lang, m));
      }
      return out;
    });
    return { message: this.common.t('media.social.stats_bulk_saved', lang, { count: saved.length }), data: saved };
  }

  private async saveStats(
    target: SocialPostTarget,
    values: Partial<Metrics>,
    mode: SocialStatsMode | undefined,
    date: string | undefined,
    user: UserEntity,
    lang: string,
    m: EntityManager,
  ) {
    if (target.status !== SocialTargetStatus.PUBLISHED && target.status !== SocialTargetStatus.REMOVED) {
      throw new BadRequestException(this.common.t('media.social.target_not_published', lang));
    }
    const statDate = dayOf(date);
    if (statDate > localDay()) throw new BadRequestException(this.common.t('media.social.future_date', lang));
    if (target.publishedAt && statDate < localDay(new Date(target.publishedAt))) {
      throw new BadRequestException(this.common.t('media.social.before_publication', lang));
    }

    let row = await m.findOne(SocialPostDailyStat, { where: { targetId: target.id, statDate } });
    if (!row) {
      row = m.create(SocialPostDailyStat, {
        companyId: target.post.companyId,
        targetId: target.id,
        postId: target.postId,
        accountId: target.accountId,
        platform: target.platform,
        statDate,
        ...zeroMetrics(),
      });
    }

    if ((mode ?? SocialStatsMode.DAILY) === SocialStatsMode.TOTAL) {
      const prev = await m
        .createQueryBuilder(SocialPostDailyStat, 's')
        .select(POST_METRICS.map((k) => `COALESCE(SUM(s.${k}), 0) AS ${k}`).join(', '))
        .where('s.targetId = :id AND s.statDate < :d', { id: target.id, d: statDate })
        .getRawOne();
      for (const k of POST_METRICS) {
        if (values[k] === undefined) continue;
        row[k] = Math.max(0, num(values[k]) - num(prev?.[k]));
      }
    } else {
      for (const k of POST_METRICS) if (values[k] !== undefined) row[k] = num(values[k]);
    }
    row.recordedById = user.id;
    const saved = await m.save(SocialPostDailyStat, row);

    // Totaux de la plateforme = somme de tous les jours
    const sums = await m
      .createQueryBuilder(SocialPostDailyStat, 's')
      .select(POST_METRICS.map((k) => `COALESCE(SUM(s.${k}), 0) AS ${k}`).join(', '))
      .addSelect('MAX(s.statDate)', 'lastDay')
      .where('s.targetId = :id', { id: target.id })
      .getRawOne();
    const patch: any = { lastStatsOn: sums?.lastDay ? dayOf(String(sums.lastDay).slice(0, 10)) : statDate };
    for (const k of POST_METRICS) patch[k] = num(sums?.[k]);
    await m.update(SocialPostTarget, { id: target.id }, patch);

    return { ...saved, totals: { ...patch, engagement: engagementOf(patch), engagementRate: rate(engagementOf(patch), patch.reach) } };
  }

  /** Évolution jour par jour d'une publication (toutes plateformes ou une seule) */
  async postStats(postId: string, query: SocialStatsQueryDto, user: UserEntity, lang: string, targetId?: string) {
    const post = await this.getPost(postId, user, lang);
    const qb = this.m
      .createQueryBuilder(SocialPostDailyStat, 's')
      .where('s.postId = :postId', { postId })
      .orderBy('s.statDate', 'ASC')
      .addOrderBy('s.platform', 'ASC');
    if (targetId) qb.andWhere('s.targetId = :targetId', { targetId });
    if (query.from) qb.andWhere('s.statDate >= :from', { from: dayOf(query.from) });
    if (query.to) qb.andWhere('s.statDate <= :to', { to: dayOf(query.to) });
    const rows = await qb.getMany();

    const byDay = new Map<string, Metrics>();
    for (const r of rows) {
      const d = String(r.statDate).slice(0, 10);
      const acc = byDay.get(d) ?? zeroMetrics();
      for (const k of POST_METRICS) acc[k] += num(r[k]);
      byDay.set(d, acc);
    }
    const days = [...byDay.entries()].map(([date, v]) => ({ date, ...v, engagement: engagementOf(v) }));
    return {
      message: this.common.t('media.social.post_stats', lang),
      data: { postId: post.id, title: post.title, days, byPlatform: rows },
    };
  }

  // ============================================================
  // RAPPORTS
  // ============================================================
  private statsQuery(companyId: string, from: string, to: string, f: { accountId?: string; platform?: string; projectId?: string; campaign?: string }) {
    const qb = this.m
      .createQueryBuilder(SocialPostDailyStat, 's')
      .innerJoin(SocialPost, 'p', 'p.id = s.postId')
      .where('s.companyId = :companyId', { companyId })
      .andWhere('s.statDate BETWEEN :from AND :to', { from, to });
    if (f.accountId) qb.andWhere('s.accountId = :accountId', { accountId: f.accountId });
    if (f.platform) qb.andWhere('s.platform = :platform', { platform: f.platform });
    if (f.projectId) qb.andWhere('p.projectId = :projectId', { projectId: f.projectId });
    if (f.campaign) qb.andWhere('p.campaign = :campaign', { campaign: f.campaign });
    return qb;
  }

  private sumSelect(qb: ReturnType<MediaSocialService['statsQuery']>) {
    POST_METRICS.forEach((k, i) => (i === 0 ? qb.select(`COALESCE(SUM(s.${k}), 0)`, k) : qb.addSelect(`COALESCE(SUM(s.${k}), 0)`, k)));
    return qb;
  }

  private shape(r: any) {
    const v = zeroMetrics();
    for (const k of POST_METRICS) v[k] = num(r?.[k]);
    const engagement = engagementOf(v);
    return { ...v, engagement, engagementRate: rate(engagement, v.reach) };
  }

  private async dailySeries(f: { accountId?: string; platform?: string; projectId?: string; campaign?: string }, companyId: string, from: string, to: string) {
    const rows = await this.sumSelect(this.statsQuery(companyId, from, to, f)).addSelect('s.statDate', 'date').groupBy('s.statDate').orderBy('s.statDate', 'ASC').getRawMany();
    const map = new Map(rows.map((r) => [String(r.date instanceof Date ? r.date.toISOString() : r.date).slice(0, 10), r]));
    const out: any[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, ...this.shape(map.get(d)) });
    return out;
  }

  /**
   * Rapport : totaux de la période, par plateforme, par compte, par jour, meilleures publications,
   * publications du jour, croissance des abonnés.
   */
  async report(query: SocialReportQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, query.companyId, lang);
    const to = dayOf(query.to);
    const from = query.from ? dayOf(query.from) : addDays(to, -29);
    if (to < from) throw new BadRequestException(this.common.t('media.social.invalid_period', lang));
    const spanDays = Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000) + 1;
    if (spanDays > 366) throw new BadRequestException(this.common.t('media.social.period_too_long', lang));
    const f = { accountId: query.accountId, platform: query.platform, projectId: query.projectId, campaign: query.campaign };

    // Période précédente de même durée (comparaison)
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(spanDays - 1));

    const [totals, previous, byPlatform, byAccount, daily, top] = await Promise.all([
      this.sumSelect(this.statsQuery(companyId, from, to, f)).getRawOne(),
      this.sumSelect(this.statsQuery(companyId, prevFrom, prevTo, f)).getRawOne(),
      this.sumSelect(this.statsQuery(companyId, from, to, f)).addSelect('s.platform', 'platform').groupBy('s.platform').getRawMany(),
      this.sumSelect(this.statsQuery(companyId, from, to, f))
        .addSelect('s.accountId', 'accountId')
        .addSelect('a.name', 'name')
        .addSelect('a.platform', 'platform')
        .addSelect('a.followers', 'followers')
        .innerJoin(SocialAccount, 'a', 'a.id = s.accountId')
        .groupBy('s.accountId')
        .addGroupBy('a.name')
        .addGroupBy('a.platform')
        .addGroupBy('a.followers')
        .getRawMany(),
      this.dailySeries(f, companyId, from, to),
      this.sumSelect(this.statsQuery(companyId, from, to, f))
        .addSelect('p.id', 'postId')
        .addSelect('p.title', 'title')
        .addSelect('p.type', 'type')
        .addSelect('p.publishedAt', 'publishedAt')
        .addSelect('GROUP_CONCAT(DISTINCT s.platform)', 'platforms')
        .groupBy('p.id')
        .addGroupBy('p.title')
        .addGroupBy('p.type')
        .addGroupBy('p.publishedAt')
        .orderBy('SUM(s.likes) + SUM(s.comments) + SUM(s.shares) + SUM(s.saves)', 'DESC')
        .limit(query.top ?? 10)
        .getRawMany(),
    ]);

    // Publications faites sur la période (par plateforme)
    const pubQb = this.m
      .createQueryBuilder(SocialPostTarget, 't')
      .innerJoin(SocialPost, 'p', 'p.id = t.postId')
      .select('t.platform', 'platform')
      .addSelect('COUNT(*)', 'count')
      .where('p.companyId = :companyId', { companyId })
      .andWhere('t.status IN (:...st)', { st: [SocialTargetStatus.PUBLISHED, SocialTargetStatus.REMOVED] })
      .andWhere('t.publishedAt >= :a AND t.publishedAt < :b', { a: new Date(`${from}T00:00:00`), b: new Date(`${addDays(to, 1)}T00:00:00`) });
    if (f.accountId) pubQb.andWhere('t.accountId = :accountId', { accountId: f.accountId });
    if (f.platform) pubQb.andWhere('t.platform = :platform', { platform: f.platform });
    if (f.projectId) pubQb.andWhere('p.projectId = :projectId', { projectId: f.projectId });
    if (f.campaign) pubQb.andWhere('p.campaign = :campaign', { campaign: f.campaign });
    const published = await pubQb.groupBy('t.platform').getRawMany();

    // Abonnés gagnés sur la période
    const folQb = this.m
      .createQueryBuilder(SocialAccountDailyStat, 'x')
      .select('x.accountId', 'accountId')
      .addSelect('SUM(x.newFollowers)', 'newFollowers')
      .addSelect('SUM(x.profileViews)', 'profileViews')
      .addSelect('SUM(x.messages)', 'messages')
      .where('x.companyId = :companyId', { companyId })
      .andWhere('x.statDate BETWEEN :from AND :to', { from, to });
    if (f.accountId) folQb.andWhere('x.accountId = :accountId', { accountId: f.accountId });
    if (f.platform) folQb.andWhere('x.platform = :platform', { platform: f.platform });
    const audience = await folQb.groupBy('x.accountId').getRawMany();
    const audienceById = new Map(audience.map((r) => [r.accountId, r]));

    const current = this.shape(totals);
    const before = this.shape(previous);
    const evolution = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 10000) / 100 : null);

    return {
      message: this.common.t('media.social.report', lang),
      data: {
        period: { from, to, days: spanDays },
        totals: {
          ...current,
          postsPublished: published.reduce((s, r) => s + num(r.count), 0),
          newFollowers: audience.reduce((s, r) => s + num(r.newFollowers), 0),
          averagePerDay: {
            likes: Math.round((current.likes / spanDays) * 100) / 100,
            comments: Math.round((current.comments / spanDays) * 100) / 100,
            views: Math.round((current.views / spanDays) * 100) / 100,
          },
        },
        previousPeriod: {
          from: prevFrom,
          to: prevTo,
          ...before,
          evolution: {
            likes: evolution(current.likes, before.likes),
            comments: evolution(current.comments, before.comments),
            shares: evolution(current.shares, before.shares),
            views: evolution(current.views, before.views),
            engagement: evolution(current.engagement, before.engagement),
          },
        },
        byPlatform: byPlatform.map((r) => ({
          platform: r.platform,
          posts: num(published.find((p) => p.platform === r.platform)?.count),
          ...this.shape(r),
        })),
        byAccount: byAccount.map((r) => {
          const a: any = audienceById.get(r.accountId) || {};
          return {
            accountId: r.accountId,
            name: r.name,
            platform: r.platform,
            followers: num(r.followers),
            newFollowers: num(a.newFollowers),
            profileViews: num(a.profileViews),
            messages: num(a.messages),
            ...this.shape(r),
          };
        }),
        daily,
        topPosts: top.map((r) => ({
          postId: r.postId,
          title: r.title,
          type: r.type,
          publishedAt: r.publishedAt,
          platforms: r.platforms ? String(r.platforms).split(',') : [],
          ...this.shape(r),
        })),
      },
    };
  }

  /** Publications en ligne dont les chiffres du jour n'ont pas encore été saisis */
  async missingStats(user: UserEntity, lang: string, companyId?: string, date?: string, days?: number) {
    const cid = await this.common.company(user, companyId, lang);
    const day = dayOf(date);
    const window = Math.min(90, Math.max(1, Number(days) || 14));
    const since = new Date(`${addDays(day, -(window - 1))}T00:00:00`);
    const rows = await this.m
      .createQueryBuilder(SocialPostTarget, 't')
      .innerJoin('t.post', 'p')
      .innerJoin('t.account', 'a')
      .select(['t.id', 't.platform', 't.publishedAt', 't.postUrl', 't.lastStatsOn', 't.likes', 't.comments', 't.views'])
      .addSelect(['p.id', 'p.title', 'p.type'])
      .addSelect(['a.id', 'a.name', 'a.handle'])
      .where('p.companyId = :cid', { cid })
      .andWhere('t.status = :st', { st: SocialTargetStatus.PUBLISHED })
      .andWhere('t.publishedAt >= :since', { since })
      .andWhere('t.publishedAt < :end', { end: new Date(`${addDays(day, 1)}T00:00:00`) })
      .andWhere('NOT EXISTS (SELECT 1 FROM `bo_social_post_daily_stats` d WHERE d.`targetId` = t.id AND d.`statDate` = :day)', { day })
      .orderBy('t.publishedAt', 'DESC')
      .getMany();
    return { message: this.common.t('media.social.missing_stats', lang, { count: rows.length }), data: { date: day, windowDays: window, items: rows } };
  }

  /** Tableau de bord réseaux sociaux */
  async dashboard(user: UserEntity, lang: string, companyId?: string) {
    const cid = await this.common.company(user, companyId, lang);
    const today = localDay();
    const yesterday = addDays(today, -1);
    const weekEnd = new Date(`${addDays(today, 8)}T00:00:00`);

    const [byStatus, accounts, upcoming, todayStats, yesterdayStats, last7, missing] = await Promise.all([
      this.m.createQueryBuilder(SocialPost, 'p').select('p.status', 'status').addSelect('COUNT(*)', 'count').where('p.companyId = :cid', { cid }).groupBy('p.status').getRawMany(),
      this.m
        .createQueryBuilder(SocialAccount, 'a')
        .select('a.platform', 'platform')
        .addSelect('COUNT(*)', 'accounts')
        .addSelect('SUM(a.followers)', 'followers')
        .where('a.companyId = :cid AND a.isActive = 1', { cid })
        .groupBy('a.platform')
        .getRawMany(),
      this.m
        .createQueryBuilder(SocialPost, 'p')
        .leftJoin('p.targets', 't')
        .addSelect(['t.id', 't.platform'])
        .where('p.companyId = :cid', { cid })
        .andWhere('p.status IN (:...st)', { st: [SocialPostStatus.APPROVED, SocialPostStatus.SCHEDULED] })
        .andWhere('p.scheduledAt >= :now AND p.scheduledAt < :end', { now: new Date(), end: weekEnd })
        .orderBy('p.scheduledAt', 'ASC')
        .take(20)
        .getMany(),
      this.sumSelect(this.statsQuery(cid, today, today, {})).getRawOne(),
      this.sumSelect(this.statsQuery(cid, yesterday, yesterday, {})).getRawOne(),
      this.dailySeries({}, cid, addDays(today, -6), today),
      this.missingStats(user, lang, cid, today, 14),
    ]);
    const pendingApproval = num(byStatus.find((r) => r.status === SocialPostStatus.PENDING_APPROVAL)?.count);
    return {
      message: this.common.t('media.social.dashboard', lang),
      data: {
        posts: Object.fromEntries(Object.values(SocialPostStatus).map((s) => [s, num(byStatus.find((r) => r.status === s)?.count)])),
        pendingApproval,
        accounts: accounts.map((r) => ({ platform: r.platform, accounts: num(r.accounts), followers: num(r.followers) })),
        upcoming,
        today: this.shape(todayStats),
        yesterday: this.shape(yesterdayStats),
        last7Days: last7,
        missingStatsToday: missing.data.items.length,
      },
    };
  }
}
