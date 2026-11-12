// src/work-schedules/work-schedules.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThan, Repository } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { UserSessionsService } from 'src/users/sessions/user-sessions.service';
import { SessionRevokeReason } from 'src/users/sessions/user-session.entity';
// Type seulement : la passerelle temps réel est récupérée à l'exécution (évite les imports circulaires)
import type { NotificationsGateway } from 'src/notification/notifications.gateway';
import {
  COMPANY_SCOPE,
  WorkSchedule,
  WorkScheduleException,
  WorkScheduleSlot,
} from './work-schedule.entity';
import {
  evaluateSlots,
  formatLocal,
  inPeriod,
  isValidTimezone,
  localParts,
  normalizeSlots,
  SlotLike,
  toMinutes,
} from './work-schedule.util';
import {
  BulkUserScheduleDto,
  CheckAccessQueryDto,
  CompaniesOverviewQueryDto,
  CompanyQueryDto,
  CreateExceptionDto,
  ExceptionsQueryDto,
  RevokeExceptionDto,
  ScheduleUsersQueryDto,
  UpsertWorkScheduleDto,
} from './work-schedules.dto';

/** Ressource de permission (table resources) pour les responsables d'entreprise */
export const WORK_SCHEDULES_RESOURCE = 'WORK_SCHEDULES';

/** Code d'erreur renvoyé aux applications quand l'accès est refusé */
export const OUTSIDE_WORK_HOURS = 'OUTSIDE_WORK_HOURS';

/** Événement WebSocket envoyé à l'utilisateur déconnecté automatiquement */
export const FORCE_LOGOUT_EVENT = 'force-logout';

/** Origine de la décision, dans l'ordre de priorité */
export type AccessSource =
  | 'DISABLED' // contrôle désactivé (WORK_SCHEDULE_ENABLED=false)
  | 'SUPER_ADMIN' // 1. Super Admin : toujours autorisé
  | 'NO_COMPANY' // utilisateur sans entreprise active (client) : non concerné
  | 'EXCEPTION' // 2. dérogation exceptionnelle en cours
  | 'USER_SCHEDULE' // 3. programme individuel
  | 'COMPANY_SCHEDULE' // 4. programme de l'entreprise
  | 'OWNER' // propriétaire non soumis au programme de l'entreprise
  | 'NO_SCHEDULE'; // aucun programme : accès libre

export type AccessDecision = {
  allowed: boolean;
  source: AccessSource;
  companyId: string | null;
  timezone: string;
  scheduleId: string | null;
  scheduleName: string | null;
  /** Accès autorisé : fin de la plage (ou de la dérogation) en cours */
  accessEndsAt: Date | null;
  /** Accès refusé : prochaine ouverture (plage ou dérogation) */
  nextAccessAt: Date | null;
  exceptionId: string | null;
};

type ScheduleData = {
  id: string;
  userId: string | null;
  name: string;
  timezone: string | null;
  isActive: boolean;
  graceMinutes: number;
  applyToOwners: boolean;
  isLocked: boolean;
  validFrom: string | null;
  validUntil: string | null;
  slots: SlotLike[];
};

type ExceptionData = { id: string; startsAt: Date; endsAt: Date };

type Bundle = {
  companyTz: string | null;
  isOwner: boolean;
  individual: ScheduleData | null;
  company: ScheduleData | null;
  exceptions: ExceptionData[];
};

type Ctx = { companyId: string; isSuper: boolean; canManage: boolean };

const ymd = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

/**
 * ✅ HORAIRES ET PROGRAMMES DE TRAVAIL
 *
 *  Le contrôle est fait dans le backend, à chaque émission de jeton (connexion, renouvellement)
 *  et à chaque requête authentifiée, avec cette priorité :
 *    1. Super Admin                       → toujours autorisé (contrôle global)
 *    2. Dérogation exceptionnelle valide  → autorisé jusqu'à sa fin
 *    3. Programme individuel              → s'il existe, actif et dans sa période
 *    4. Programme de l'entreprise         → règle par défaut (propriétaires exemptés sauf applyToOwners)
 *    Aucun programme                      → accès libre
 *
 *  Gestion : propriétaire de l'entreprise ou permission WORK_SCHEDULES (can_manage / can_update) ;
 *  le Super Admin gère toutes les entreprises et peut verrouiller un programme.
 *
 *  .env : WORK_SCHEDULE_ENABLED, WORK_SCHEDULE_DEFAULT_TIMEZONE, WORK_SCHEDULE_CACHE_SECONDS,
 *         WORK_SCHEDULE_EXCEPTION_MAX_DAYS
 */
@Injectable()
export class WorkSchedulesService implements OnModuleDestroy {
  private readonly logger = new Logger('WorkSchedules');
  private readonly cache = new Map<string, { bundle: Bundle; at: number }>();
  /** Déconnexions programmées à la seconde près (fin de plage dans la minute) */
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private enforcing = false;
  private gatewayRef: NotificationsGateway | null | undefined;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(WorkSchedule) private readonly schedules: Repository<WorkSchedule>,
    @InjectRepository(WorkScheduleSlot) private readonly slotsRepo: Repository<WorkScheduleSlot>,
    @InjectRepository(WorkScheduleException) private readonly exceptions: Repository<WorkScheduleException>,
    private readonly i18n: I18nService,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly sessions?: UserSessionsService,
  ) {}

  onModuleDestroy() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  // ============================================================
  // RÉGLAGES
  // ============================================================
  get enabled(): boolean {
    return String(process.env.WORK_SCHEDULE_ENABLED ?? 'true').toLowerCase() !== 'false';
  }

  get defaultTimezone(): string {
    const tz = process.env.WORK_SCHEDULE_DEFAULT_TIMEZONE || 'Africa/Lubumbashi';
    return isValidTimezone(tz) ? tz : 'Africa/Lubumbashi';
  }

  private get cacheMs(): number {
    const v = Number(process.env.WORK_SCHEDULE_CACHE_SECONDS);
    return (Number.isFinite(v) && v >= 0 ? v : 60) * 1000;
  }

  private get maxExceptionDays(): number {
    const v = Number(process.env.WORK_SCHEDULE_EXCEPTION_MAX_DAYS);
    return Number.isFinite(v) && v > 0 ? v : 31;
  }

  private t(key: string, lang: string, params?: Record<string, any>): string {
    try {
      return this.i18n.translate(key, lang, params);
    } catch {
      return key;
    }
  }

  // ============================================================
  // 1) CONTRÔLE D'ACCÈS (connexion + chaque requête)
  // ============================================================

  /**
   * Décision pour un utilisateur connecté (rôle + entreprise active).
   * Ne lève jamais d'erreur : en cas de problème technique, l'accès est autorisé (journalisé).
   */
  async decide(
    user: { id: string; role?: string | null; activeCompanyId?: string | null },
    at: Date = new Date(),
  ): Promise<AccessDecision> {
    const base = (source: AccessSource, companyId: string | null = null): AccessDecision => ({
      allowed: true,
      source,
      companyId,
      timezone: this.defaultTimezone,
      scheduleId: null,
      scheduleName: null,
      accessEndsAt: null,
      nextAccessAt: null,
      exceptionId: null,
    });

    if (!this.enabled) return base('DISABLED');
    if (user.role === UserRole.SUPER_ADMIN) return base('SUPER_ADMIN');
    const companyId = user.activeCompanyId || null;
    if (!companyId) return base('NO_COMPANY');

    try {
      const bundle = (await this.loadBundles(companyId, [user.id])).get(user.id)!;
      return this.evaluate(bundle, companyId, at);
    } catch (e: any) {
      this.logger.error(`Contrôle des horaires impossible (${user.id}) : ${e?.message}`);
      return base('NO_SCHEDULE', companyId);
    }
  }

  /** Priorité : dérogation → programme individuel → programme de l'entreprise → libre */
  private evaluate(bundle: Bundle, companyId: string, at: Date): AccessDecision {
    const companyTz = bundle.companyTz && isValidTimezone(bundle.companyTz) ? bundle.companyTz : this.defaultTimezone;
    const tzOf = (s: ScheduleData | null) => (s?.timezone && isValidTimezone(s.timezone) ? s.timezone : companyTz);

    // 2. Dérogation en cours
    const now = at.getTime();
    const active = bundle.exceptions
      .filter((e) => e.startsAt.getTime() <= now && e.endsAt.getTime() > now)
      .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
    if (active) {
      return {
        allowed: true,
        source: 'EXCEPTION',
        companyId,
        timezone: companyTz,
        scheduleId: null,
        scheduleName: null,
        accessEndsAt: active.endsAt,
        nextAccessAt: null,
        exceptionId: active.id,
      };
    }

    const applicable = (s: ScheduleData | null): boolean => {
      if (!s || !s.isActive) return false;
      return inPeriod(localParts(at, tzOf(s)).ymd, s.validFrom, s.validUntil);
    };

    // 3. Programme individuel, sinon 4. programme de l'entreprise
    let schedule: ScheduleData | null = null;
    let source: AccessSource = 'NO_SCHEDULE';
    if (applicable(bundle.individual)) {
      schedule = bundle.individual;
      source = 'USER_SCHEDULE';
    } else if (applicable(bundle.company)) {
      if (bundle.isOwner && !bundle.company!.applyToOwners) {
        return { ...this.free(companyId, companyTz), source: 'OWNER' };
      }
      schedule = bundle.company;
      source = 'COMPANY_SCHEDULE';
    }
    if (!schedule) return this.free(companyId, companyTz);

    const timezone = tzOf(schedule);
    const parts = localParts(at, timezone);
    const weekMinute = (parts.day - 1) * 1440 + parts.minutes;
    const result = evaluateSlots(schedule.slots, weekMinute, schedule.graceMinutes || 0);
    const minute = 60000;
    const startOfMinute = Math.floor(now / minute) * minute;

    let nextAccessAt: Date | null = null;
    if (!result.allowed) {
      const candidates: number[] = [];
      if (result.minutesToNext !== null) candidates.push(startOfMinute + result.minutesToNext * minute);
      const upcoming = bundle.exceptions.filter((e) => e.startsAt.getTime() > now).map((e) => e.startsAt.getTime());
      candidates.push(...upcoming);
      if (candidates.length) nextAccessAt = new Date(Math.min(...candidates));
    }

    return {
      allowed: result.allowed,
      source,
      companyId,
      timezone,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      accessEndsAt: result.allowed && result.minutesLeft !== null ? new Date(startOfMinute + result.minutesLeft * minute) : null,
      nextAccessAt,
      exceptionId: null,
    };
  }

  private free(companyId: string, timezone: string): AccessDecision {
    return {
      allowed: true,
      source: 'NO_SCHEDULE',
      companyId,
      timezone,
      scheduleId: null,
      scheduleName: null,
      accessEndsAt: null,
      nextAccessAt: null,
      exceptionId: null,
    };
  }

  /** Erreur 403 envoyée aux applications (code OUTSIDE_WORK_HOURS + prochaine ouverture) */
  denial(decision: AccessDecision, lang = 'fr'): ForbiddenException {
    const message = decision.nextAccessAt
      ? this.t('work_schedule.outside_hours', lang, {
          next: formatLocal(decision.nextAccessAt, decision.timezone, lang),
          timezone: decision.timezone,
        })
      : this.t('work_schedule.outside_hours_none', lang);
    return new ForbiddenException({
      code: OUTSIDE_WORK_HOURS,
      message,
      workSchedule: {
        source: decision.source,
        scheduleName: decision.scheduleName,
        timezone: decision.timezone,
        nextAccessAt: decision.nextAccessAt,
      },
    });
  }

  /** Avant d'émettre un jeton (connexion, Google, Apple, renouvellement, changement d'entreprise) */
  async assertCanIssueToken(user: { id: string; role?: any; activeCompanyId?: string | null; preferredLanguage?: string | null }, lang?: string) {
    const decision = await this.decide(user);
    if (!decision.allowed) throw this.denial(decision, lang || user.preferredLanguage || 'fr');
  }

  // ============================================================
  // CHARGEMENT (avec cache court)
  // ============================================================
  private cacheKey(companyId: string, userId: string) {
    return `${companyId}:${userId}`;
  }

  /** Vide le cache d'une entreprise (après toute modification) */
  invalidate(companyId: string, userId?: string) {
    if (userId) {
      this.cache.delete(this.cacheKey(companyId, userId));
      return;
    }
    const prefix = `${companyId}:`;
    for (const key of this.cache.keys()) if (key.startsWith(prefix)) this.cache.delete(key);
  }

  private toData(s: WorkSchedule | null | undefined): ScheduleData | null {
    if (!s) return null;
    return {
      id: s.id,
      userId: s.userId ?? null,
      name: s.name,
      timezone: s.timezone ?? null,
      isActive: !!s.isActive,
      graceMinutes: Number(s.graceMinutes) || 0,
      applyToOwners: !!s.applyToOwners,
      isLocked: !!s.isLocked,
      validFrom: ymd(s.validFrom),
      validUntil: ymd(s.validUntil),
      slots: (s.slots ?? []).map((x) => ({ dayOfWeek: Number(x.dayOfWeek), startTime: x.startTime, endTime: x.endTime })),
    };
  }

  /** Données utiles au contrôle, pour plusieurs utilisateurs d'une même entreprise (4 requêtes au plus) */
  private async loadBundles(companyId: string, userIds: string[]): Promise<Map<string, Bundle>> {
    const out = new Map<string, Bundle>();
    const now = Date.now();
    const missing: string[] = [];
    for (const id of new Set(userIds)) {
      const hit = this.cache.get(this.cacheKey(companyId, id));
      if (hit && now - hit.at < this.cacheMs) out.set(id, hit.bundle);
      else missing.push(id);
    }
    if (!missing.length) return out;

    const [companyRows, schedules, exceptions, owners] = await Promise.all([
      this.dataSource.query('SELECT `timezone` FROM `company` WHERE `id` = ? LIMIT 1', [companyId]),
      this.schedules.find({
        where: [
          { companyId, userId: IsNull() },
          { companyId, userId: In(missing) },
        ],
        relations: { slots: true },
      }),
      this.exceptions.find({
        where: { companyId, userId: In(missing), revokedAt: IsNull(), endsAt: MoreThan(new Date()) },
      }),
      this.dataSource.query(
        'SELECT `userId`, MAX(`isOwner`) AS `isOwner` FROM `user_has_company` WHERE `companyId` = ? AND `userId` IN (?) GROUP BY `userId`',
        [companyId, missing],
      ),
    ]);

    const companyTz: string | null = companyRows?.[0]?.timezone ?? null;
    const companySchedule = this.toData(schedules.find((s) => !s.userId));
    const ownerSet = new Set((owners ?? []).filter((r: any) => Number(r.isOwner) === 1).map((r: any) => r.userId));

    for (const id of missing) {
      const bundle: Bundle = {
        companyTz,
        isOwner: ownerSet.has(id),
        individual: this.toData(schedules.find((s) => s.userId === id)),
        company: companySchedule,
        exceptions: exceptions
          .filter((e) => e.userId === id)
          .map((e) => ({ id: e.id, startsAt: new Date(e.startsAt), endsAt: new Date(e.endsAt) })),
      };
      this.cache.set(this.cacheKey(companyId, id), { bundle, at: now });
      out.set(id, bundle);
    }
    if (this.cache.size > 20000) this.cache.clear();
    return out;
  }

  // ============================================================
  // 2) DROITS DE GESTION
  // ============================================================
  private isSuper(user: UserEntity) {
    return user?.role === UserRole.SUPER_ADMIN;
  }

  /** Entreprise concernée + droits : Super Admin (toutes), propriétaire ou permission WORK_SCHEDULES */
  private async ctx(user: UserEntity, companyId: string | undefined, need: 'read' | 'manage', lang: string): Promise<Ctx> {
    const id = companyId || user?.activeCompanyId;
    if (!id) throw new BadRequestException(this.t('work_schedule.company_required', lang));

    if (this.isSuper(user)) {
      const exists = await this.dataSource.query('SELECT 1 FROM `company` WHERE `id` = ? LIMIT 1', [id]);
      if (!exists?.length) throw new NotFoundException(this.t('work_schedule.company_not_found', lang));
      return { companyId: id, isSuper: true, canManage: true };
    }

    const owner = await this.dataSource.query(
      'SELECT MAX(`isOwner`) AS `isOwner` FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ?',
      [user.id, id],
    );
    if (owner?.[0]?.isOwner === null || owner?.[0]?.isOwner === undefined) {
      throw new ForbiddenException(this.t('work_schedule.forbidden', lang));
    }
    if (Number(owner[0].isOwner) === 1) return { companyId: id, isSuper: false, canManage: true };

    const perms = await this.dataSource.query(
      'SELECT MAX(p.`can_manage`) AS m, MAX(p.`can_update`) AS u, MAX(p.`can_read`) AS r ' +
        'FROM `company_has_user_resource` p ' +
        'INNER JOIN `user_has_company` uhc ON uhc.`id` = p.`userCompanyId` ' +
        'INNER JOIN `resources` res ON res.`id` = p.`resourceId` ' +
        'WHERE uhc.`userId` = ? AND uhc.`companyId` = ? AND res.`name` = ? AND p.`status` = 1',
      [user.id, id, WORK_SCHEDULES_RESOURCE],
    );
    const p = perms?.[0] ?? {};
    const canManage = Number(p.m) === 1 || Number(p.u) === 1;
    const canRead = canManage || Number(p.r) === 1;
    if (need === 'manage' ? !canManage : !canRead) throw new ForbiddenException(this.t('work_schedule.forbidden', lang));
    return { companyId: id, isSuper: false, canManage };
  }

  /** L'utilisateur cible appartient-il à l'entreprise ? */
  private async assertMember(companyId: string, userId: string, lang: string) {
    const rows = await this.dataSource.query(
      'SELECT 1 FROM `user_has_company` WHERE `companyId` = ? AND `userId` = ? LIMIT 1',
      [companyId, userId],
    );
    if (!rows?.length) throw new BadRequestException(this.t('work_schedule.user_not_member', lang));
  }

  // ============================================================
  // 3) PROGRAMMES
  // ============================================================
  private present(s: WorkSchedule | null, companyTz: string | null) {
    if (!s) return null;
    const data = this.toData(s)!;
    return {
      id: s.id,
      companyId: s.companyId,
      userId: s.userId ?? null,
      scope: s.userId ? 'USER' : 'COMPANY',
      name: s.name,
      timezone: s.timezone ?? null,
      effectiveTimezone: (s.timezone && isValidTimezone(s.timezone) ? s.timezone : null) ||
        (companyTz && isValidTimezone(companyTz) ? companyTz : this.defaultTimezone),
      isActive: data.isActive,
      graceMinutes: data.graceMinutes,
      applyToOwners: data.applyToOwners,
      isLocked: data.isLocked,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
      notes: s.notes ?? null,
      slots: normalizeSlots(data.slots),
      weeklyHours: this.weeklyHours(data.slots),
      createdById: s.createdById ?? null,
      updatedById: s.updatedById ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  /** Total d'heures autorisées par semaine (indicatif) */
  private weeklyHours(slots: SlotLike[]): number {
    let minutes = 0;
    for (const s of slots) {
      const a = toMinutes(s.startTime);
      const b = toMinutes(s.endTime);
      minutes += b > a ? b - a : b + 1440 - a;
    }
    return Math.round((minutes / 60) * 100) / 100;
  }

  private async companyTz(companyId: string): Promise<string | null> {
    const rows = await this.dataSource.query('SELECT `timezone` FROM `company` WHERE `id` = ? LIMIT 1', [companyId]);
    return rows?.[0]?.timezone ?? null;
  }

  private validate(dto: UpsertWorkScheduleDto, lang: string) {
    if (dto.timezone && !isValidTimezone(dto.timezone)) {
      throw new BadRequestException(this.t('work_schedule.invalid_timezone', lang, { timezone: dto.timezone }));
    }
    const from = ymd(dto.validFrom);
    const until = ymd(dto.validUntil);
    if (from && until && until < from) throw new BadRequestException(this.t('work_schedule.invalid_period', lang));
    const slots = normalizeSlots(dto.slots ?? []);
    if ((dto.isActive ?? true) && !slots.length) throw new BadRequestException(this.t('work_schedule.slots_required', lang));
    return { slots, from, until };
  }

  /** Création ou mise à jour d'un programme (entreprise si userId null) */
  private async save(user: UserEntity, ctx: Ctx, userId: string | null, dto: UpsertWorkScheduleDto, lang: string) {
    const { slots, from, until } = this.validate(dto, lang);
    const scopeKey = userId ?? COMPANY_SCOPE;

    if (dto.isLocked !== undefined && !ctx.isSuper) {
      throw new ForbiddenException(this.t('work_schedule.super_admin_only', lang));
    }

    return this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(WorkSchedule);
      let schedule = await repo.findOne({ where: { companyId: ctx.companyId, scopeKey } });
      if (schedule?.isLocked && !ctx.isSuper) throw new ForbiddenException(this.t('work_schedule.locked', lang));

      const defaultName = userId ? this.t('work_schedule.default_name_user', lang) : this.t('work_schedule.default_name_company', lang);
      if (!schedule) {
        schedule = repo.create({
          companyId: ctx.companyId,
          userId,
          scopeKey,
          name: dto.name?.trim() || defaultName,
          createdById: user.id,
        });
      }
      if (dto.name !== undefined) schedule.name = dto.name?.trim() || schedule.name || defaultName;
      if (dto.timezone !== undefined) schedule.timezone = dto.timezone || null;
      if (dto.isActive !== undefined) schedule.isActive = dto.isActive;
      else if (schedule.isActive === undefined) schedule.isActive = true;
      if (dto.graceMinutes !== undefined) schedule.graceMinutes = dto.graceMinutes;
      if (dto.applyToOwners !== undefined) schedule.applyToOwners = userId ? false : dto.applyToOwners;
      if (dto.isLocked !== undefined) schedule.isLocked = dto.isLocked;
      if (dto.validFrom !== undefined) schedule.validFrom = from;
      if (dto.validUntil !== undefined) schedule.validUntil = until;
      if (dto.notes !== undefined) schedule.notes = dto.notes || null;
      schedule.updatedById = user.id;
      schedule.slots = undefined;

      const saved = await repo.save(schedule);
      await m.getRepository(WorkScheduleSlot).delete({ scheduleId: saved.id });
      if (slots.length) {
        await m.getRepository(WorkScheduleSlot).insert(slots.map((s) => ({ ...s, scheduleId: saved.id })));
      }
      return saved.id;
    });
  }

  private async findOneWithSlots(id: string) {
    return this.schedules.findOne({ where: { id }, relations: { slots: true } });
  }

  // ---------------- Programme de l'entreprise ----------------
  async getCompany(user: UserEntity, q: CompanyQueryDto, lang: string) {
    const ctx = await this.ctx(user, q.companyId, 'read', lang);
    const schedule = await this.schedules.findOne({
      where: { companyId: ctx.companyId, scopeKey: COMPANY_SCOPE },
      relations: { slots: true },
    });
    return {
      message: this.t('work_schedule.fetched', lang),
      data: { companyId: ctx.companyId, canManage: ctx.canManage, isSuperAdmin: ctx.isSuper, schedule: this.present(schedule, await this.companyTz(ctx.companyId)) },
    };
  }

  async upsertCompany(user: UserEntity, dto: UpsertWorkScheduleDto, lang: string) {
    const ctx = await this.ctx(user, dto.companyId, 'manage', lang);
    const id = await this.save(user, ctx, null, dto, lang);
    this.invalidate(ctx.companyId);
    this.enforceSoon(ctx.companyId);
    return {
      message: this.t('work_schedule.saved_company', lang),
      data: this.present(await this.findOneWithSlots(id), await this.companyTz(ctx.companyId)),
    };
  }

  async removeCompany(user: UserEntity, q: CompanyQueryDto, lang: string) {
    const ctx = await this.ctx(user, q.companyId, 'manage', lang);
    const schedule = await this.schedules.findOne({ where: { companyId: ctx.companyId, scopeKey: COMPANY_SCOPE } });
    if (!schedule) throw new NotFoundException(this.t('work_schedule.not_found', lang));
    if (schedule.isLocked && !ctx.isSuper) throw new ForbiddenException(this.t('work_schedule.locked', lang));
    await this.schedules.delete({ id: schedule.id });
    this.invalidate(ctx.companyId);
    return { message: this.t('work_schedule.deleted_company', lang), data: { id: schedule.id } };
  }

  // ---------------- Programmes individuels ----------------
  async getUser(user: UserEntity, userId: string, q: CompanyQueryDto, lang: string) {
    const ctx = await this.ctx(user, q.companyId, 'read', lang);
    await this.assertMember(ctx.companyId, userId, lang);
    const [schedule, decision, tz, person] = await Promise.all([
      this.schedules.findOne({ where: { companyId: ctx.companyId, scopeKey: userId }, relations: { slots: true } }),
      this.decideFor(ctx.companyId, userId),
      this.companyTz(ctx.companyId),
      this.person(userId),
    ]);
    return {
      message: this.t('work_schedule.fetched', lang),
      data: {
        companyId: ctx.companyId,
        canManage: ctx.canManage,
        user: person,
        schedule: this.present(schedule, tz),
        access: this.presentDecision(decision, lang),
      },
    };
  }

  async upsertUser(user: UserEntity, userId: string, dto: UpsertWorkScheduleDto, lang: string) {
    const ctx = await this.ctx(user, dto.companyId, 'manage', lang);
    await this.assertMember(ctx.companyId, userId, lang);
    const id = await this.save(user, ctx, userId, dto, lang);
    this.invalidate(ctx.companyId, userId);
    this.enforceSoon(ctx.companyId, [userId]);
    return {
      message: this.t('work_schedule.saved_user', lang),
      data: this.present(await this.findOneWithSlots(id), await this.companyTz(ctx.companyId)),
    };
  }

  async bulkUsers(user: UserEntity, dto: BulkUserScheduleDto, lang: string) {
    const ctx = await this.ctx(user, dto.companyId, 'manage', lang);
    const ids = [...new Set(dto.userIds)];
    const members = await this.dataSource.query(
      'SELECT DISTINCT `userId` FROM `user_has_company` WHERE `companyId` = ? AND `userId` IN (?)',
      [ctx.companyId, ids],
    );
    const memberSet = new Set((members ?? []).map((r: any) => r.userId));
    const saved: string[] = [];
    const skipped: { userId: string; reason: string }[] = [];
    const { userIds: _ignored, ...scheduleDto } = dto;
    for (const id of ids) {
      if (!memberSet.has(id)) {
        skipped.push({ userId: id, reason: this.t('work_schedule.user_not_member', lang) });
        continue;
      }
      try {
        await this.save(user, ctx, id, scheduleDto as UpsertWorkScheduleDto, lang);
        saved.push(id);
      } catch (e: any) {
        skipped.push({ userId: id, reason: e?.response?.message || e?.message || 'error' });
      }
    }
    this.invalidate(ctx.companyId);
    this.enforceSoon(ctx.companyId, saved);
    return {
      message: this.t('work_schedule.bulk_saved', lang, { count: saved.length }),
      data: { saved, skipped },
    };
  }

  async removeUser(user: UserEntity, userId: string, q: CompanyQueryDto, lang: string) {
    const ctx = await this.ctx(user, q.companyId, 'manage', lang);
    const schedule = await this.schedules.findOne({ where: { companyId: ctx.companyId, scopeKey: userId } });
    if (!schedule) throw new NotFoundException(this.t('work_schedule.not_found', lang));
    if (schedule.isLocked && !ctx.isSuper) throw new ForbiddenException(this.t('work_schedule.locked', lang));
    await this.schedules.delete({ id: schedule.id });
    this.invalidate(ctx.companyId, userId);
    this.enforceSoon(ctx.companyId, [userId]);
    return { message: this.t('work_schedule.deleted_user', lang), data: { id: schedule.id } };
  }

  // ---------------- Utilisateurs de l'entreprise + règle appliquée ----------------
  async listUsers(user: UserEntity, q: ScheduleUsersQueryDto, lang: string) {
    const ctx = await this.ctx(user, q.companyId, 'read', lang);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const filter = q.filter || 'all';

    const where: string[] = ['uhc.`companyId` = ?'];
    const params: any[] = [ctx.companyId];
    if (q.search?.trim()) {
      const s = `%${q.search.trim()}%`;
      where.push('(u.`fullName` LIKE ? OR u.`email` LIKE ? OR u.`phone` LIKE ?)');
      params.push(s, s, s);
    }
    if (filter === 'individual') {
      where.push('EXISTS (SELECT 1 FROM `work_schedules` ws WHERE ws.`companyId` = uhc.`companyId` AND ws.`userId` = u.`id`)');
    } else if (filter === 'company') {
      where.push('NOT EXISTS (SELECT 1 FROM `work_schedules` ws WHERE ws.`companyId` = uhc.`companyId` AND ws.`userId` = u.`id`)');
    } else if (filter === 'exception') {
      where.push(
        'EXISTS (SELECT 1 FROM `work_schedule_exceptions` e WHERE e.`companyId` = uhc.`companyId` AND e.`userId` = u.`id` AND e.`revokedAt` IS NULL AND e.`startsAt` <= ? AND e.`endsAt` > ?)',
      );
      const now = new Date();
      params.push(now, now);
    }
    const whereSql = where.join(' AND ');
    const base =
      'FROM `user_has_company` uhc INNER JOIN `users` u ON u.`id` = uhc.`userId` WHERE ' + whereSql;
    const select =
      'SELECT u.`id`, u.`fullName`, u.`email`, u.`phone`, u.`image`, u.`role`, u.`isActive`, MAX(uhc.`isOwner`) AS `isOwner` ' +
      base +
      ' GROUP BY u.`id`, u.`fullName`, u.`email`, u.`phone`, u.`image`, u.`role`, u.`isActive` ORDER BY u.`fullName` ASC';

    // Filtres « autorisé / bloqué » : calculés pour tous les membres, puis paginés
    const byAccess = filter === 'allowed' || filter === 'blocked';
    let rows: any[];
    let total: number;
    if (byAccess) {
      rows = await this.dataSource.query(select + ' LIMIT 5000', params);
      total = rows.length;
    } else {
      const countRows = await this.dataSource.query('SELECT COUNT(DISTINCT u.`id`) AS `total` ' + base, params);
      total = Number(countRows?.[0]?.total) || 0;
      rows = await this.dataSource.query(select + ' LIMIT ? OFFSET ?', [...params, limit, (page - 1) * limit]);
    }

    const ids = rows.map((r) => r.id);
    const bundles = ids.length ? await this.loadBundles(ctx.companyId, ids) : new Map<string, Bundle>();
    const now = new Date();
    let items = rows.map((r) => {
      const bundle = bundles.get(r.id)!;
      const decision =
        r.role === UserRole.SUPER_ADMIN
          ? { ...this.free(ctx.companyId, this.defaultTimezone), source: 'SUPER_ADMIN' as AccessSource }
          : this.enabled
            ? this.evaluate(bundle, ctx.companyId, now)
            : { ...this.free(ctx.companyId, this.defaultTimezone), source: 'DISABLED' as AccessSource };
      return {
        user: {
          id: r.id,
          fullName: r.fullName,
          email: r.email,
          phone: r.phone,
          image: r.image,
          role: r.role,
          isActive: !!Number(r.isActive),
          isOwner: Number(r.isOwner) === 1,
        },
        hasIndividualSchedule: !!bundle?.individual,
        individualSchedule: bundle?.individual
          ? { id: bundle.individual.id, name: bundle.individual.name, isActive: bundle.individual.isActive, isLocked: bundle.individual.isLocked }
          : null,
        activeException: decision.source === 'EXCEPTION' ? { id: decision.exceptionId, endsAt: decision.accessEndsAt } : null,
        access: this.presentDecision(decision, lang),
      };
    });

    if (byAccess) {
      items = items.filter((i) => (filter === 'allowed' ? i.access.allowed : !i.access.allowed));
      total = items.length;
      items = items.slice((page - 1) * limit, page * limit);
    }

    return {
      message: this.t('work_schedule.users_fetched', lang),
      data: new PaginatedResponseDto(items, total, page, limit),
    };
  }

  // ============================================================
  // 4) DÉROGATIONS EXCEPTIONNELLES
  // ============================================================
  private exceptionStatus(e: WorkScheduleException, now = Date.now()): string {
    if (e.revokedAt) return 'REVOKED';
    if (new Date(e.endsAt).getTime() <= now) return 'EXPIRED';
    if (new Date(e.startsAt).getTime() > now) return 'UPCOMING';
    return 'ACTIVE';
  }

  private presentException(e: WorkScheduleException, people: Map<string, any>) {
    return {
      id: e.id,
      companyId: e.companyId,
      userId: e.userId,
      user: people.get(e.userId) ?? null,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      reason: e.reason,
      status: this.exceptionStatus(e),
      createdById: e.createdById ?? null,
      createdBy: e.createdById ? people.get(e.createdById) ?? null : null,
      revokedAt: e.revokedAt ?? null,
      revokedById: e.revokedById ?? null,
      revokeReason: e.revokeReason ?? null,
      createdAt: e.createdAt,
    };
  }

  async listExceptions(user: UserEntity, q: ExceptionsQueryDto, lang: string) {
    const ctx = await this.ctx(user, q.companyId, 'read', lang);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const now = new Date();

    const qb = this.exceptions.createQueryBuilder('e').where('e.companyId = :companyId', { companyId: ctx.companyId });
    if (q.userId) qb.andWhere('e.userId = :userId', { userId: q.userId });
    switch (q.status) {
      case 'active':
        qb.andWhere('e.revokedAt IS NULL AND e.startsAt <= :now AND e.endsAt > :now', { now });
        break;
      case 'upcoming':
        qb.andWhere('e.revokedAt IS NULL AND e.startsAt > :now', { now });
        break;
      case 'valid':
        qb.andWhere('e.revokedAt IS NULL AND e.endsAt > :now', { now });
        break;
      case 'expired':
        qb.andWhere('e.revokedAt IS NULL AND e.endsAt <= :now', { now });
        break;
      case 'revoked':
        qb.andWhere('e.revokedAt IS NOT NULL');
        break;
    }
    const [rows, total] = await qb
      .orderBy('e.startsAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const people = await this.people([...rows.map((r) => r.userId), ...rows.map((r) => r.createdById || '')]);
    return {
      message: this.t('work_schedule.exceptions_fetched', lang),
      data: new PaginatedResponseDto(rows.map((r) => this.presentException(r, people)), total, page, limit),
    };
  }

  async createException(user: UserEntity, dto: CreateExceptionDto, lang: string) {
    const ctx = await this.ctx(user, dto.companyId, 'manage', lang);
    await this.assertMember(ctx.companyId, dto.userId, lang);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException(this.t('work_schedule.exception_invalid_period', lang));
    }
    if (endsAt.getTime() <= Date.now()) throw new BadRequestException(this.t('work_schedule.exception_in_past', lang));
    const maxMs = this.maxExceptionDays * 86400000;
    if (endsAt.getTime() - startsAt.getTime() > maxMs) {
      throw new BadRequestException(this.t('work_schedule.exception_too_long', lang, { days: this.maxExceptionDays }));
    }

    const saved = await this.exceptions.save(
      this.exceptions.create({
        companyId: ctx.companyId,
        userId: dto.userId,
        startsAt,
        endsAt,
        reason: dto.reason.trim(),
        createdById: user.id,
      }),
    );
    this.invalidate(ctx.companyId, dto.userId);
    const people = await this.people([saved.userId, user.id]);
    return { message: this.t('work_schedule.exception_created', lang), data: this.presentException(saved, people) };
  }

  async revokeException(user: UserEntity, id: string, dto: RevokeExceptionDto, lang: string) {
    const exc = await this.exceptions.findOne({ where: { id } });
    if (!exc) throw new NotFoundException(this.t('work_schedule.exception_not_found', lang));
    const ctx = await this.ctx(user, exc.companyId, 'manage', lang);
    if (exc.revokedAt) throw new BadRequestException(this.t('work_schedule.exception_already_revoked', lang));
    exc.revokedAt = new Date();
    exc.revokedById = user.id;
    exc.revokeReason = dto?.reason?.trim() || null;
    const saved = await this.exceptions.save(exc);
    this.invalidate(ctx.companyId, exc.userId);
    this.enforceSoon(ctx.companyId, [exc.userId]);
    const people = await this.people([saved.userId, saved.createdById || '']);
    return { message: this.t('work_schedule.exception_revoked', lang), data: this.presentException(saved, people) };
  }

  // ============================================================
  // 5) CONSULTATION / SIMULATION
  // ============================================================
  private sourceLabel(source: AccessSource, lang: string) {
    return this.t(`work_schedule.source.${source}`, lang);
  }

  presentDecision(d: AccessDecision, lang: string) {
    return {
      allowed: d.allowed,
      source: d.source,
      sourceLabel: this.sourceLabel(d.source, lang),
      timezone: d.timezone,
      scheduleId: d.scheduleId,
      scheduleName: d.scheduleName,
      exceptionId: d.exceptionId,
      accessEndsAt: d.accessEndsAt,
      accessEndsAtLabel: d.accessEndsAt ? formatLocal(d.accessEndsAt, d.timezone, lang) : null,
      nextAccessAt: d.nextAccessAt,
      nextAccessAtLabel: d.nextAccessAt ? formatLocal(d.nextAccessAt, d.timezone, lang) : null,
    };
  }

  private async decideFor(companyId: string, userId: string, at = new Date()): Promise<AccessDecision> {
    const rows = await this.dataSource.query('SELECT `role` FROM `users` WHERE `id` = ? LIMIT 1', [userId]);
    return this.decide({ id: userId, role: rows?.[0]?.role ?? null, activeCompanyId: companyId }, at);
  }

  /** Simulation : l'utilisateur aurait-il accès à cet instant ? */
  async check(user: UserEntity, q: CheckAccessQueryDto, lang: string) {
    const ctx = await this.ctx(user, q.companyId, 'read', lang);
    await this.assertMember(ctx.companyId, q.userId, lang);
    const at = q.at ? new Date(q.at) : new Date();
    const decision = await this.decideFor(ctx.companyId, q.userId, at);
    return {
      message: this.t('work_schedule.check_done', lang),
      data: { at, user: await this.person(q.userId), access: this.presentDecision(decision, lang) },
    };
  }

  /** Mon programme : règle appliquée, plages de la semaine, dérogations en cours / à venir */
  async me(user: UserEntity, lang: string) {
    const decision = await this.decide({ id: user.id, role: user.role, activeCompanyId: user.activeCompanyId });
    let schedule: any = null;
    let exceptions: any[] = [];
    if (user.activeCompanyId) {
      const tz = await this.companyTz(user.activeCompanyId);
      if (decision.scheduleId) schedule = this.present(await this.findOneWithSlots(decision.scheduleId), tz);
      const rows = await this.exceptions.find({
        where: { companyId: user.activeCompanyId, userId: user.id, revokedAt: IsNull(), endsAt: MoreThan(new Date()) },
        order: { startsAt: 'ASC' },
        take: 20,
      });
      exceptions = rows.map((e) => ({
        id: e.id,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        reason: e.reason,
        status: this.exceptionStatus(e),
      }));
    }
    return {
      message: this.t('work_schedule.me_fetched', lang),
      data: { companyId: user.activeCompanyId ?? null, access: this.presentDecision(decision, lang), schedule, exceptions },
    };
  }

  /** Super Admin : vue d'ensemble des entreprises */
  async companiesOverview(user: UserEntity, q: CompaniesOverviewQueryDto, lang: string) {
    if (!this.isSuper(user)) throw new ForbiddenException(this.t('work_schedule.super_admin_only', lang));
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const params: any[] = [];
    let where = '1 = 1';
    if (q.search?.trim()) {
      where = 'c.`companyName` LIKE ?';
      params.push(`%${q.search.trim()}%`);
    }
    const countRows = await this.dataSource.query('SELECT COUNT(*) AS `total` FROM `company` c WHERE ' + where, params);
    const rows = await this.dataSource.query(
      'SELECT c.`id`, c.`companyName`, c.`timezone`, ' +
        '(SELECT COUNT(DISTINCT uhc.`userId`) FROM `user_has_company` uhc WHERE uhc.`companyId` = c.`id`) AS `usersCount`, ' +
        "(SELECT ws.`id` FROM `work_schedules` ws WHERE ws.`companyId` = c.`id` AND ws.`scopeKey` = 'COMPANY' LIMIT 1) AS `companyScheduleId`, " +
        "(SELECT ws.`isActive` FROM `work_schedules` ws WHERE ws.`companyId` = c.`id` AND ws.`scopeKey` = 'COMPANY' LIMIT 1) AS `companyScheduleActive`, " +
        "(SELECT ws.`isLocked` FROM `work_schedules` ws WHERE ws.`companyId` = c.`id` AND ws.`scopeKey` = 'COMPANY' LIMIT 1) AS `companyScheduleLocked`, " +
        '(SELECT COUNT(*) FROM `work_schedules` ws WHERE ws.`companyId` = c.`id` AND ws.`userId` IS NOT NULL) AS `individualSchedules`, ' +
        '(SELECT COUNT(*) FROM `work_schedule_exceptions` e WHERE e.`companyId` = c.`id` AND e.`revokedAt` IS NULL AND e.`startsAt` <= ? AND e.`endsAt` > ?) AS `activeExceptions` ' +
        'FROM `company` c WHERE ' +
        where +
        ' ORDER BY c.`companyName` ASC LIMIT ? OFFSET ?',
      [new Date(), new Date(), ...params, limit, (page - 1) * limit],
    );
    const items = rows.map((r: any) => ({
      companyId: r.id,
      companyName: r.companyName,
      timezone: r.timezone || this.defaultTimezone,
      usersCount: Number(r.usersCount) || 0,
      hasCompanySchedule: !!r.companyScheduleId,
      companyScheduleActive: r.companyScheduleId ? Number(r.companyScheduleActive) === 1 : false,
      companyScheduleLocked: r.companyScheduleId ? Number(r.companyScheduleLocked) === 1 : false,
      individualSchedules: Number(r.individualSchedules) || 0,
      activeExceptions: Number(r.activeExceptions) || 0,
    }));
    return {
      message: this.t('work_schedule.overview_fetched', lang),
      data: new PaginatedResponseDto(items, Number(countRows?.[0]?.total) || 0, page, limit),
    };
  }

  // ============================================================
  // 6) DÉCONNEXION AUTOMATIQUE À LA FIN DES HORAIRES
  // ============================================================

  private get gateway(): NotificationsGateway | null {
    if (this.gatewayRef === undefined) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { NotificationsGateway: Gateway } = require('../notification/notifications.gateway');
        this.gatewayRef = this.moduleRef.get(Gateway, { strict: false });
      } catch {
        this.gatewayRef = null;
      }
    }
    return this.gatewayRef ?? null;
  }

  /**
   * Toutes les minutes : les utilisateurs connectés (session ouverte) dont l'accès vient de se terminer
   * sont déconnectés (sessions fermées + événement « force-logout » + sockets fermés).
   * Les fins de plage dans la minute qui vient sont programmées à la seconde près.
   */
  @Cron('5 * * * * *')
  async enforceConnectedUsers(): Promise<void> {
    if (!this.enabled || this.enforcing) return;
    this.enforcing = true;
    try {
      await this.enforce();
    } catch (e: any) {
      this.logger.warn(`Contrôle des connexions impossible : ${e?.message}`);
    } finally {
      this.enforcing = false;
    }
  }

  /** Après une modification (programme, dérogation annulée) : contrôle immédiat, en arrière-plan */
  private enforceSoon(companyId: string, userIds?: string[]) {
    if (!this.enabled) return;
    setTimeout(() => {
      this.enforce(companyId, userIds).catch((e) => this.logger.warn(`Contrôle immédiat impossible : ${e?.message}`));
    }, 500);
  }

  /** Utilisateurs connectés soumis à un programme actif (option : une entreprise / quelques utilisateurs) */
  private async enforce(companyId?: string, userIds?: string[]): Promise<void> {
    if (!this.sessions) return;
    const now = new Date();
    const params: any[] = [now, UserRole.SUPER_ADMIN];
    let extra = '';
    if (companyId) {
      extra += ' AND u.`activeCompanyId` = ?';
      params.push(companyId);
    }
    if (userIds?.length) {
      extra += ' AND u.`id` IN (?)';
      params.push(userIds);
    }
    const rows: any[] = await this.dataSource.query(
      'SELECT DISTINCT u.`id`, u.`role`, u.`activeCompanyId`, u.`preferredLanguage` ' +
        'FROM `user_sessions` s INNER JOIN `users` u ON u.`id` = s.`userId` ' +
        'WHERE s.`revokedAt` IS NULL AND s.`expiresAt` > ? AND u.`activeCompanyId` IS NOT NULL AND u.`role` <> ?' +
        extra +
        ' AND EXISTS (SELECT 1 FROM `work_schedules` ws WHERE ws.`companyId` = u.`activeCompanyId` AND ws.`isActive` = 1)',
      params,
    );
    if (!rows.length) return;

    const byCompany = new Map<string, any[]>();
    for (const r of rows) {
      const list = byCompany.get(r.activeCompanyId) ?? [];
      list.push(r);
      byCompany.set(r.activeCompanyId, list);
    }

    for (const [cid, users] of byCompany) {
      const bundles = await this.loadBundles(cid, users.map((u) => u.id));
      for (const u of users) {
        const decision = this.evaluate(bundles.get(u.id)!, cid, new Date());
        if (!decision.allowed) {
          await this.forceLogout(u.id, decision, u.preferredLanguage || 'fr');
        } else if (decision.accessEndsAt) {
          const wait = decision.accessEndsAt.getTime() - Date.now();
          if (wait > 0 && wait <= 65000) this.scheduleCheck(u.id, cid, wait);
        }
      }
    }
  }

  /** Vérification à l'instant exact de la fin de plage */
  private scheduleCheck(userId: string, companyId: string, waitMs: number) {
    if (this.timers.has(userId)) return;
    const timer = setTimeout(() => {
      this.timers.delete(userId);
      this.invalidate(companyId, userId);
      this.enforce(companyId, [userId]).catch(() => undefined);
    }, waitMs + 1000);
    this.timers.set(userId, timer);
  }

  /** Ferme les sessions, prévient les applications ouvertes et coupe leurs sockets */
  private async forceLogout(userId: string, decision: AccessDecision, lang: string) {
    const closed = await this.sessions!.revokeAllForUser(userId, SessionRevokeReason.OUTSIDE_WORK_HOURS, {
      note: decision.scheduleName ? `Fin des horaires : ${decision.scheduleName}` : 'Fin des horaires de travail',
    });
    if (!closed) return;

    const err = this.denial(decision, lang).getResponse() as any;
    const payload = {
      code: OUTSIDE_WORK_HOURS,
      reason: OUTSIDE_WORK_HOURS,
      message: err?.message,
      workSchedule: err?.workSchedule,
      at: new Date(),
    };
    const gw = this.gateway;
    try {
      gw?.server?.to(userId).emit(FORCE_LOGOUT_EVENT, payload);
      // Laisse le temps à l'événement d'arriver avant de couper les connexions temps réel
      setTimeout(() => {
        try {
          gw?.server?.in(userId).disconnectSockets(true);
        } catch {
          /* ignore */
        }
      }, 1500);
    } catch (e: any) {
      this.logger.warn(`Événement de déconnexion non envoyé (${userId}) : ${e?.message}`);
    }
    this.logger.log(`⏰ ${userId} déconnecté automatiquement (${closed} session(s)) : fin des horaires de travail`);
  }

  // ============================================================
  // PERSONNES (nom, photo) pour l'affichage
  // ============================================================
  private async person(userId: string) {
    return (await this.people([userId])).get(userId) ?? null;
  }

  private async people(ids: string[]): Promise<Map<string, any>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const map = new Map<string, any>();
    if (!unique.length) return map;
    const rows = await this.dataSource.query(
      'SELECT `id`, `fullName`, `email`, `phone`, `image`, `role` FROM `users` WHERE `id` IN (?)',
      [unique],
    );
    for (const r of rows ?? []) map.set(r.id, { id: r.id, fullName: r.fullName, email: r.email, phone: r.phone, image: r.image, role: r.role });
    return map;
  }
}
