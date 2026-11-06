import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EntityManager, In } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { NeedContext, NeedRates, NeedsAccessService, round2 } from './common/needs-access.service';
import { NeedAction, NeedFinanceStatus, NeedLevelStatus, NeedMemberRole, NeedStatus } from './common/needs.enums';
import { NeedItem, NeedLevelState, NeedRequest } from './entities/need.entity';
import { NeedLevelConfig, NeedRule } from './entities/need-config.entity';
import { NeedApproveDto, NeedCorrectionDto, NeedRejectDto } from './dto/needs.dto';

export type NeedPlanInput = {
  companyId: string;
  requesterId: string;
  departmentId?: string | null;
  category?: string | null;
  priority?: string | null;
  amount: number;
  currency: string;
};

export type NeedPlan = {
  rule: NeedRule | null;
  amountUsd: number | null;
  levels: NeedLevelState[];
};

/** Circuit par défaut (aucune règle) : chef de service puis direction générale */
const DEFAULT_LEVELS: NeedLevelConfig[] = [
  { name: 'Chef de service', approverRoles: ['DEPARTMENT_MANAGER'], minApprovals: 1, call: true },
  { name: 'Direction générale', approverRoles: ['OWNER'], minApprovals: 1, call: true },
];

/**
 * ✅ CIRCUIT DE VALIDATION SÉQUENTIEL
 *  - À la soumission, seul le niveau 1 est notifié (push + appel) et peut décider.
 *  - Une approbation fait passer au niveau suivant (notifié à son tour), jusqu'au dernier → VALIDÉ.
 *  - Rejet (motif obligatoire) ou demande de correction : retour à l'agent.
 *  - Personne n'intervient avant son tour, sauf un administrateur du module (override, tracé).
 *  - Chaque changement d'étape se fait en transaction, la demande verrouillée (pessimistic_write).
 *  - Relances automatiques puis escalade (remplaçants, direction).
 */
@Injectable()
export class NeedsWorkflowService {
  private readonly logger = new Logger(NeedsWorkflowService.name);

  constructor(private readonly access: NeedsAccessService) { }

  private get m() {
    return this.access.m;
  }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.access.t(key, lang, params);
  }

  current(n: NeedRequest): NeedLevelState | null {
    return (n.levels ?? []).find((l) => l.level === n.currentLevel) ?? null;
  }

  // ============================================================
  // CALCUL DU CIRCUIT
  // ============================================================

  /** Règle applicable : département, catégorie, priorité, montant ; la plus prioritaire puis le seuil le plus haut */
  async matchRule(input: NeedPlanInput, m: EntityManager = this.m): Promise<{ rule: NeedRule | null; amountUsd: number | null }> {
    const rates = new NeedRates(m);
    const amountUsd = await rates.convert(input.amount, input.currency, 'USD');
    const rules = await m.find(NeedRule, { where: { companyId: input.companyId, isActive: true }, order: { priority: 'DESC', minAmount: 'DESC' } });
    for (const r of rules) {
      if (r.departmentIds?.length && (!input.departmentId || !r.departmentIds.includes(input.departmentId))) continue;
      if (r.categories?.length && (!input.category || !r.categories.map((c) => c.toUpperCase()).includes(input.category.toUpperCase()))) continue;
      if (r.priorities?.length && (!input.priority || !r.priorities.includes(input.priority as any))) continue;
      const amt = await rates.convert(input.amount, input.currency, r.currency || 'USD');
      if (amt === null) continue; // taux manquant : règle ignorée
      if (amt < Number(r.minAmount || 0)) continue;
      if (r.maxAmount !== null && r.maxAmount !== undefined && amt >= Number(r.maxAmount)) continue;
      return { rule: r, amountUsd };
    }
    return { rule: null, amountUsd };
  }

  private async resolveLevel(
    input: NeedPlanInput,
    cfg: NeedLevelConfig,
    index: number,
    allowSelf: boolean,
    amountInRuleCurrency: number | null,
    cache: { owners?: string[]; finance?: string[]; admins?: string[]; dept?: any; parent?: any },
    m: EntityManager,
  ): Promise<NeedLevelState> {
    const ids = new Set<string>(cfg.approverIds ?? []);
    const roles = (cfg.approverRoles ?? []).map((r) => String(r).toUpperCase());
    if (!ids.size && !roles.length) roles.push('OWNER');
    let skipReason: string | null = null;

    // Seuil du niveau (validation supplémentaire au-delà d'un montant)
    if (cfg.minAmount !== null && cfg.minAmount !== undefined && amountInRuleCurrency !== null && amountInRuleCurrency < Number(cfg.minAmount)) {
      skipReason = 'BELOW_THRESHOLD';
    }

    if (roles.includes('DEPARTMENT_MANAGER') || roles.includes('PARENT_DEPARTMENT_MANAGER')) {
      cache.dept ??= input.departmentId ? await this.access.department(input.departmentId, m) : await this.access.departmentOf(input.requesterId, input.companyId, m);
      if (roles.includes('DEPARTMENT_MANAGER') && cache.dept?.managerId) ids.add(cache.dept.managerId);
      if (roles.includes('PARENT_DEPARTMENT_MANAGER') && cache.dept?.parentId) {
        cache.parent ??= await this.access.department(cache.dept.parentId, m);
        if (cache.parent?.managerId) ids.add(cache.parent.managerId);
      }
    }
    if (roles.includes('OWNER')) {
      cache.owners ??= await this.access.ownerIds(input.companyId, m);
      cache.owners.forEach((id) => ids.add(id));
    }
    if (roles.includes('FINANCE')) {
      cache.finance ??= await this.access.financeIds(input.companyId, m);
      cache.finance.forEach((id) => ids.add(id));
    }
    if (roles.includes('NEED_ADMIN')) {
      cache.admins ??= await this.access.adminIds(input.companyId, m);
      cache.admins.forEach((id) => ids.add(id));
    }

    let status = NeedLevelStatus.WAITING;
    if (skipReason) status = NeedLevelStatus.SKIPPED;
    else if (ids.has(input.requesterId) && allowSelf) {
      status = NeedLevelStatus.SKIPPED;
      skipReason = 'REQUESTER_AUTHORITY';
    } else {
      ids.delete(input.requesterId); // personne ne valide sa propre demande
      if (!ids.size && !(cfg.substituteIds ?? []).length) {
        // Aucun validateur à ce niveau (ex. pas de chef de département) : la direction prend le relais
        cache.owners ??= await this.access.ownerIds(input.companyId, m);
        cache.owners.filter((id) => id !== input.requesterId).forEach((id) => ids.add(id));
      }
      if (!ids.size && !(cfg.substituteIds ?? []).length) {
        status = NeedLevelStatus.SKIPPED;
        skipReason = 'NO_APPROVER';
      }
    }
    const approverIds = [...ids];
    return {
      level: index + 1,
      name: cfg.name,
      approverIds,
      substituteIds: (cfg.substituteIds ?? []).filter((id) => id !== input.requesterId),
      approverRoles: roles,
      minApprovals: Math.max(1, Math.min(Number(cfg.minApprovals) || 1, approverIds.length || 1)),
      call: cfg.call !== false,
      reminderMinutes: Number(cfg.reminderMinutes) || this.access.reminderMinutes,
      maxReminders: cfg.maxReminders ?? this.access.maxReminders,
      escalateToIds: (cfg.escalateToIds ?? []).filter((id) => id !== input.requesterId),
      status,
      approvals: [],
      decidedById: null,
      decision: null,
      comment: null,
      startedAt: null,
      completedAt: status === NeedLevelStatus.SKIPPED ? new Date().toISOString() : null,
      reminders: 0,
      escalatedAt: null,
      skipReason,
    };
  }

  /** Circuit complet d'une demande */
  async plan(input: NeedPlanInput, m: EntityManager = this.m): Promise<NeedPlan> {
    const { rule, amountUsd } = await this.matchRule(input, m);
    const configs = rule?.levels?.length ? rule.levels : DEFAULT_LEVELS;
    const inRule = rule ? await new NeedRates(m).convert(input.amount, input.currency, rule.currency || 'USD') : amountUsd;
    const cache: any = {};
    const levels: NeedLevelState[] = [];
    for (let i = 0; i < configs.length; i++) {
      levels.push(await this.resolveLevel(input, configs[i], i, !!rule?.allowSelfApproval, inRule, cache, m));
    }
    return { rule, amountUsd, levels };
  }

  /** Démarre le prochain niveau à valider (à partir de l'index donné) ; null = tout est validé */
  startNext(n: NeedRequest, fromLevel = 1): NeedLevelState | null {
    const now = new Date().toISOString();
    for (const l of n.levels ?? []) {
      if (l.level < fromLevel) continue;
      if (l.status === NeedLevelStatus.SKIPPED || l.status === NeedLevelStatus.APPROVED) continue;
      l.status = NeedLevelStatus.CURRENT;
      l.startedAt = now;
      l.completedAt = null;
      l.reminders = 0;
      l.escalatedAt = null;
      l.approvals = [];
      l.decision = null;
      l.decidedById = null;
      n.currentLevel = l.level;
      n.levelStartedAt = new Date(now);
      return l;
    }
    n.currentLevel = 0;
    n.levelStartedAt = null;
    return null;
  }

  // ============================================================
  // QUI PEUT DÉCIDER
  // ============================================================

  /** Personnes qui peuvent décider au niveau en cours : titulaires, remplaçants, délégués des absents */
  async actorsOf(n: NeedRequest, lvl: NeedLevelState, m: EntityManager = this.m): Promise<{ all: string[]; delegates: Map<string, string> }> {
    const absent = await this.access.unavailable(n.companyId, lvl.approverIds, m);
    const delegates = new Map<string, string>();
    for (const [uid, del] of absent) if (del && del !== n.requesterId) delegates.set(del, uid);
    return {
      all: [...new Set([...lvl.approverIds, ...lvl.substituteIds, ...delegates.keys()])].filter((id) => id !== n.requesterId),
      delegates,
    };
  }

  /** Personnes à prévenir maintenant : titulaires disponibles, + délégués / remplaçants des absents */
  async targetsOf(n: NeedRequest, lvl: NeedLevelState, opts: { escalated?: boolean } = {}, m: EntityManager = this.m): Promise<string[]> {
    const approved = new Set(lvl.approvals.map((a) => a.userId));
    const absent = await this.access.unavailable(n.companyId, lvl.approverIds, m);
    const out = new Set<string>();
    let someoneAbsent = false;
    for (const id of lvl.approverIds) {
      if (approved.has(id)) continue;
      if (absent.has(id)) {
        someoneAbsent = true;
        const del = absent.get(id);
        if (del) out.add(del);
      } else out.add(id);
    }
    if (someoneAbsent || opts.escalated || !out.size) lvl.substituteIds.forEach((id) => out.add(id));
    out.delete(n.requesterId);
    return [...out].filter((id) => !approved.has(id));
  }

  private async assertCanDecide(n: NeedRequest, user: UserEntity, ctx: NeedContext, override: boolean | undefined, lang: string, m: EntityManager) {
    if (n.status !== NeedStatus.PENDING) throw new BadRequestException(this.t('needs.not_pending', lang));
    const lvl = this.current(n);
    if (!lvl) throw new BadRequestException(this.t('needs.not_pending', lang));
    if (n.requesterId === user.id && !override) throw new ForbiddenException(this.t('needs.cannot_validate_own', lang));
    const { all, delegates } = await this.actorsOf(n, lvl, m);
    if (all.includes(user.id)) {
      if (lvl.approvals.some((a) => a.userId === user.id)) throw new ConflictException(this.t('needs.already_decided', lang));
      return { lvl, asSubstitute: !lvl.approverIds.includes(user.id), delegateFor: delegates.get(user.id) ?? null, override: false };
    }
    // Hors tour : seulement un administrateur du module, explicitement
    if (override && this.access.isAdmin(ctx)) return { lvl, asSubstitute: false, delegateFor: null, override: true };
    const waitingLater = (n.levels ?? []).some((l) => l.level > lvl.level && (l.approverIds.includes(user.id) || l.substituteIds.includes(user.id)));
    throw new ForbiddenException(this.t(waitingLater ? 'needs.not_your_turn' : 'needs.not_validator', lang, { level: lvl.level, name: lvl.name }));
  }

  private async lockNeed(m: EntityManager, id: string, lang: string): Promise<NeedRequest> {
    const n = await m.findOne(NeedRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!n) throw new NotFoundException(this.t('needs.not_found', lang));
    return n;
  }

  // ============================================================
  // SOUMISSION
  // ============================================================

  /**
   * Soumettre (ou resoumettre après correction).
   * Après correction, si la règle ne change pas et que le montant n'augmente pas, le circuit reprend
   * au niveau qui a demandé la correction (les niveaux déjà approuvés restent approuvés) ;
   * sinon il recommence au niveau 1.
   */
  async submit(id: string, user: UserEntity, lang: string, comment?: string | null) {
    const res = await this.access.dataSource.transaction(async (m) => {
      const n = await this.lockNeed(m, id, lang);
      if (n.requesterId !== user.id) throw new ForbiddenException(this.t('needs.only_requester', lang));
      if (![NeedStatus.DRAFT, NeedStatus.CORRECTION_REQUESTED].includes(n.status)) throw new BadRequestException(this.t('needs.cannot_submit', lang, { status: n.status }));
      const items = await m.find(NeedItem, { where: { needId: n.id } });
      if (!items.length) throw new BadRequestException(this.t('needs.items_required', lang));
      if (!String(n.justification || '').trim()) throw new BadRequestException(this.t('needs.justification_required', lang));
      const total = round2(items.reduce((s, i) => s + Number(i.total || 0), 0));
      if (!(total > 0)) throw new BadRequestException(this.t('needs.amount_required', lang));

      const from = n.status;
      const plan = await this.plan(
        { companyId: n.companyId, requesterId: n.requesterId, departmentId: n.departmentId, category: n.category, priority: n.priority, amount: total, currency: n.currency },
        m,
      );

      let resumeFrom = 1;
      const isResubmit = from === NeedStatus.CORRECTION_REQUESTED && !!n.levels?.length;
      if (isResubmit && (plan.rule?.id ?? null) === (n.ruleId ?? null) && total <= Number(n.estimatedTotal) && n.correctionLevel) {
        // Reprise : on garde les niveaux déjà approuvés
        const old = n.levels!;
        for (const l of plan.levels) {
          const prev = old.find((o) => o.level === l.level);
          if (prev && prev.status === NeedLevelStatus.APPROVED && l.level < n.correctionLevel) {
            Object.assign(l, { status: NeedLevelStatus.APPROVED, approvals: prev.approvals, decidedById: prev.decidedById, decision: prev.decision, comment: prev.comment, startedAt: prev.startedAt, completedAt: prev.completedAt });
          }
        }
        resumeFrom = n.correctionLevel;
      }

      n.levels = plan.levels;
      n.ruleId = plan.rule?.id ?? null;
      n.ruleName = plan.rule?.name ?? null;
      n.allowSelfApproval = !!plan.rule?.allowSelfApproval;
      n.estimatedTotal = total;
      n.estimatedTotalUsd = plan.amountUsd;
      n.status = NeedStatus.PENDING;
      n.submittedAt = new Date();
      n.firstSubmittedAt = n.firstSubmittedAt ?? n.submittedAt;
      n.submissions = (n.submissions || 0) + 1;
      n.correctionLevel = null;
      n.correctionMessage = null;
      n.rejectedAt = null;
      n.rejectionReason = null;
      n.approvedAmount = null;

      await this.access.log(m, n.id, isResubmit ? NeedAction.RESUBMITTED : NeedAction.SUBMITTED, user, {
        fromStatus: from,
        toStatus: NeedStatus.PENDING,
        comment: comment ?? null,
        payload: {
          total,
          currency: n.currency,
          amountUsd: plan.amountUsd,
          ruleId: n.ruleId,
          ruleName: n.ruleName,
          resumeFromLevel: resumeFrom,
          levels: plan.levels.map((l) => ({ level: l.level, name: l.name, approverIds: l.approverIds, status: l.status, skipReason: l.skipReason ?? null })),
        },
      });
      for (const l of plan.levels.filter((x) => x.status === NeedLevelStatus.SKIPPED)) {
        await this.access.log(m, n.id, NeedAction.LEVEL_SKIPPED, null, { level: l.level, comment: l.skipReason ?? null });
      }

      const next = this.startNext(n, resumeFrom);
      if (next) await this.access.log(m, n.id, NeedAction.LEVEL_STARTED, null, { level: next.level, payload: { name: next.name, approverIds: next.approverIds } });
      else await this.markValidated(m, n, user, 'NO_LEVEL');
      await m.save(NeedRequest, n);
      return { n, started: !!next };
    });

    // Après la transaction : notifications (ne bloquent jamais la soumission)
    void this.access.notify([res.n.requesterId], 'submitted', this.params(res.n), this.data(res.n), lang);
    if (res.started) void this.announce(res.n.id, lang);
    else void this.afterValidated(res.n.id, lang);
    return res.n;
  }

  // ============================================================
  // DÉCISIONS
  // ============================================================

  async approve(id: string, user: UserEntity, ctx: NeedContext, dto: NeedApproveDto, lang: string) {
    const res = await this.access.dataSource.transaction(async (m) => {
      const n = await this.lockNeed(m, id, lang);
      const { lvl, asSubstitute, delegateFor, override } = await this.assertCanDecide(n, user, ctx, dto.override, lang, m);
      const limit = Number(n.approvedAmount ?? n.estimatedTotal);
      if (dto.approvedAmount !== undefined && dto.approvedAmount !== null && dto.approvedAmount > limit) {
        throw new BadRequestException(this.t('needs.approved_amount_too_high', lang, { max: limit, currency: n.currency }));
      }
      lvl.approvals.push({
        userId: user.id,
        at: new Date().toISOString(),
        comment: dto.comment ?? null,
        approvedAmount: dto.approvedAmount ?? null,
        asSubstitute: asSubstitute || undefined,
        override: override || undefined,
      });
      if (dto.approvedAmount !== undefined && dto.approvedAmount !== null) n.approvedAmount = round2(dto.approvedAmount);

      await this.access.log(m, n.id, override ? NeedAction.OVERRIDE : NeedAction.APPROVED, user, {
        level: lvl.level,
        comment: dto.comment ?? null,
        payload: { decision: 'APPROVED', levelName: lvl.name, approvedAmount: dto.approvedAmount ?? null, asSubstitute, delegateFor, override },
      });

      const done = override || lvl.approvals.length >= lvl.minApprovals;
      let next: NeedLevelState | null = null;
      let validated = false;
      if (done) {
        lvl.status = NeedLevelStatus.APPROVED;
        lvl.completedAt = new Date().toISOString();
        lvl.decidedById = user.id;
        lvl.decision = 'APPROVED';
        lvl.comment = dto.comment ?? null;
        next = this.startNext(n, lvl.level + 1);
        if (next) {
          await this.access.log(m, n.id, NeedAction.LEVEL_STARTED, null, { level: next.level, payload: { name: next.name, approverIds: next.approverIds } });
        } else {
          await this.markValidated(m, n, user, 'LAST_LEVEL');
          validated = true;
        }
      }
      n.levels = [...(n.levels ?? [])];
      await m.save(NeedRequest, n);
      return { n, lvl, done, next, validated };
    });

    const { n, lvl, done, next, validated } = res;
    if (done) {
      this.access.stopRinging([...lvl.approverIds, ...lvl.substituteIds], n.id, lvl.level, 'APPROVED');
      void this.access.notify([n.requesterId], 'level_approved', { ...this.params(n), level: lvl.level, levelName: lvl.name }, this.data(n), lang);
    }
    if (next) void this.announce(n.id, lang);
    if (validated) void this.afterValidated(n.id, lang);
    this.emitUpdated(n);
    return n;
  }

  async reject(id: string, user: UserEntity, ctx: NeedContext, dto: NeedRejectDto, lang: string) {
    const res = await this.access.dataSource.transaction(async (m) => {
      const n = await this.lockNeed(m, id, lang);
      const { lvl, asSubstitute, delegateFor, override } = await this.assertCanDecide(n, user, ctx, dto.override, lang, m);
      lvl.status = NeedLevelStatus.REJECTED;
      lvl.completedAt = new Date().toISOString();
      lvl.decidedById = user.id;
      lvl.decision = 'REJECTED';
      lvl.comment = dto.reason;
      const from = n.status;
      n.status = NeedStatus.REJECTED;
      n.rejectedAt = new Date();
      n.rejectionReason = dto.reason;
      n.levels = [...(n.levels ?? [])];
      await m.save(NeedRequest, n);
      await this.access.log(m, n.id, override ? NeedAction.OVERRIDE : NeedAction.REJECTED, user, {
        level: lvl.level,
        fromStatus: from,
        toStatus: NeedStatus.REJECTED,
        comment: dto.reason,
        payload: { decision: 'REJECTED', levelName: lvl.name, asSubstitute, delegateFor, override },
      });
      return { n, lvl };
    });
    this.access.stopRinging([...res.lvl.approverIds, ...res.lvl.substituteIds], res.n.id, res.lvl.level, 'REJECTED');
    void this.access.notify([res.n.requesterId], 'rejected', { ...this.params(res.n), level: res.lvl.level, levelName: res.lvl.name, reason: dto.reason }, this.data(res.n), lang);
    this.emitUpdated(res.n);
    return res.n;
  }

  async requestCorrection(id: string, user: UserEntity, ctx: NeedContext, dto: NeedCorrectionDto, lang: string) {
    const res = await this.access.dataSource.transaction(async (m) => {
      const n = await this.lockNeed(m, id, lang);
      const { lvl, asSubstitute, delegateFor, override } = await this.assertCanDecide(n, user, ctx, dto.override, lang, m);
      lvl.status = NeedLevelStatus.RETURNED;
      lvl.completedAt = new Date().toISOString();
      lvl.decidedById = user.id;
      lvl.decision = 'CORRECTION_REQUESTED';
      lvl.comment = dto.message;
      const from = n.status;
      n.status = NeedStatus.CORRECTION_REQUESTED;
      n.correctionLevel = lvl.level;
      n.correctionMessage = dto.message;
      n.levels = [...(n.levels ?? [])];
      await m.save(NeedRequest, n);
      await this.access.log(m, n.id, override ? NeedAction.OVERRIDE : NeedAction.CORRECTION_REQUESTED, user, {
        level: lvl.level,
        fromStatus: from,
        toStatus: NeedStatus.CORRECTION_REQUESTED,
        comment: dto.message,
        payload: { decision: 'CORRECTION_REQUESTED', levelName: lvl.name, asSubstitute, delegateFor, override },
      });
      return { n, lvl };
    });
    this.access.stopRinging([...res.lvl.approverIds, ...res.lvl.substituteIds], res.n.id, res.lvl.level, 'RETURNED');
    void this.access.notify([res.n.requesterId], 'correction', { ...this.params(res.n), level: res.lvl.level, levelName: res.lvl.name, message: dto.message }, this.data(res.n), lang);
    this.emitUpdated(res.n);
    return res.n;
  }

  /** Dernier niveau approuvé → VALIDÉ, puis transmis au service financier (NEEDS_AUTO_TRANSMIT, oui par défaut) */
  private async markValidated(m: EntityManager, n: NeedRequest, user: UserEntity | null, reason: string) {
    const from = n.status;
    n.status = NeedStatus.VALIDATED;
    n.validatedAt = new Date();
    n.currentLevel = 0;
    n.levelStartedAt = null;
    if (n.approvedAmount === null || n.approvedAmount === undefined) n.approvedAmount = Number(n.estimatedTotal);
    await this.access.log(m, n.id, NeedAction.VALIDATED, user, { fromStatus: from, toStatus: NeedStatus.VALIDATED, payload: { reason, approvedAmount: n.approvedAmount, currency: n.currency } });
    if (String(process.env.NEEDS_AUTO_TRANSMIT ?? 'true').toLowerCase() !== 'false') {
      n.financeStatus = NeedFinanceStatus.TRANSMITTED;
      n.transmittedAt = new Date();
      await this.access.log(m, n.id, NeedAction.TRANSMITTED, null, { toStatus: NeedFinanceStatus.TRANSMITTED, payload: { auto: true } });
    }
  }

  private async afterValidated(id: string, lang: string) {
    try {
      const n = await this.m.findOne(NeedRequest, { where: { id } });
      if (!n) return;
      await this.access.notify([n.requesterId], 'validated', this.params(n), this.data(n), lang);
      if (n.financeStatus === NeedFinanceStatus.TRANSMITTED) {
        const finance = (await this.access.financeIds(n.companyId)).filter((x) => x !== n.requesterId);
        const sent = await this.access.notify(finance, 'to_finance', this.params(n), this.data(n), lang);
        await this.access.log(this.m, n.id, NeedAction.NOTIFIED, null, { payload: { key: 'to_finance', to: sent } });
      }
      this.emitUpdated(n);
    } catch (e: any) {
      this.logger.warn(`Validation finale ${id} : ${e?.message}`);
    }
  }

  // ============================================================
  // NOTIFICATIONS DU NIVEAU EN COURS
  // ============================================================

  params(n: NeedRequest) {
    const lvl = this.current(n);
    return {
      reference: n.reference,
      title: n.title,
      name: n.requesterName || '',
      department: n.departmentName || '-',
      amount: Number(n.approvedAmount ?? n.estimatedTotal),
      currency: n.currency,
      priority: n.priority,
      level: lvl?.level ?? n.currentLevel,
      levels: n.levels?.length ?? 0,
      levelName: lvl?.name ?? '',
    };
  }

  data(n: NeedRequest) {
    return {
      needId: n.id,
      companyId: n.companyId,
      reference: n.reference,
      status: n.status,
      financeStatus: n.financeStatus,
      level: n.currentLevel,
      amount: Number(n.approvedAmount ?? n.estimatedTotal),
      currency: n.currency,
      priority: n.priority,
    };
  }

  /** Le niveau en cours reçoit : notification enregistrée + push + appel (sonnerie) ; tout est tracé */
  async announce(id: string, lang: string, opts: { reminder?: boolean; escalated?: boolean } = {}) {
    try {
      const n = await this.m.findOne(NeedRequest, { where: { id } });
      if (!n || n.status !== NeedStatus.PENDING) return;
      const lvl = this.current(n);
      if (!lvl) return;
      const targets = await this.targetsOf(n, lvl, { escalated: opts.escalated });
      if (!targets.length) return;
      const params = this.params(n);
      const data = this.data(n);
      const key = opts.reminder ? 'approval_reminder' : opts.escalated ? 'approval_escalated' : 'approval_request';
      const sent = await this.access.notify(targets, key, params, { ...data, event: key }, lang);
      await this.access.log(this.m, n.id, NeedAction.NOTIFIED, null, { level: lvl.level, payload: { key, to: sent } });
      if (lvl.call) {
        const reached = await this.access.call(targets, n.id, lvl.level, params, data, lang);
        await this.access.log(this.m, n.id, NeedAction.CALLED, null, { level: lvl.level, payload: { to: targets, reached } });
      }
      if (!opts.reminder && !opts.escalated && lvl.level > 1) {
        void this.access.notify([n.requesterId], 'progress', params, data, lang);
      }
      this.emitUpdated(n);
    } catch (e: any) {
      this.logger.warn(`Annonce état de besoin ${id} : ${e?.message}`);
    }
  }

  emitUpdated(n: NeedRequest) {
    const ids = [n.requesterId, ...(n.levels ?? []).flatMap((l) => [...l.approverIds, ...l.substituteIds])];
    this.access.emit(ids, 'needs:updated', {
      needId: n.id,
      reference: n.reference,
      status: n.status,
      financeStatus: n.financeStatus,
      executionStatus: n.executionStatus,
      currentLevel: n.currentLevel,
      levels: (n.levels ?? []).map((l) => ({ level: l.level, name: l.name, status: l.status })),
    });
  }

  // ============================================================
  // RELANCES AUTOMATIQUES + ESCALADE
  // ============================================================

  @Cron('0 */5 * * * *')
  async reminders() {
    if (String(process.env.NEEDS_REMINDERS ?? 'true').toLowerCase() === 'false') return;
    let list: NeedRequest[] = [];
    try {
      list = await this.m.find(NeedRequest, { where: { status: NeedStatus.PENDING }, take: 500, order: { levelStartedAt: 'ASC' } });
    } catch {
      return; // tables absentes (script SQL pas encore exécuté)
    }
    const now = Date.now();
    for (const n0 of list) {
      try {
        const l0 = this.current(n0);
        if (!l0?.startedAt) continue;
        const started = new Date(l0.startedAt).getTime();
        const every = Math.max(5, l0.reminderMinutes || this.access.reminderMinutes) * 60000;
        const max = l0.maxReminders ?? this.access.maxReminders;
        const dueReminder = l0.reminders < max && now >= started + every * (l0.reminders + 1);
        const dueEscalation = !l0.escalatedAt && l0.reminders >= max && now >= started + every * (max + 1);
        if (!dueReminder && !dueEscalation) continue;

        // Réservation sous verrou (plusieurs instances pm2 : une seule relance)
        const action = await this.access.dataSource.transaction(async (m) => {
          const n = await m.findOne(NeedRequest, { where: { id: n0.id }, lock: { mode: 'pessimistic_write' } });
          const lvl = n ? this.current(n) : null;
          if (!n || n.status !== NeedStatus.PENDING || !lvl || lvl.level !== l0.level) return null;
          if (dueReminder && lvl.reminders === l0.reminders) {
            lvl.reminders += 1;
            n.levels = [...(n.levels ?? [])];
            await m.save(NeedRequest, n);
            await this.access.log(m, n.id, NeedAction.REMINDED, null, { level: lvl.level, payload: { auto: true, count: lvl.reminders } });
            return { kind: 'remind' as const, n, lvl };
          }
          if (dueEscalation && !lvl.escalatedAt) {
            lvl.escalatedAt = new Date().toISOString();
            let to = lvl.escalateToIds.length ? lvl.escalateToIds : lvl.substituteIds.length ? lvl.substituteIds : await this.access.adminIds(n.companyId, m);
            to = to.filter((id) => id !== n.requesterId);
            n.levels = [...(n.levels ?? [])];
            await m.save(NeedRequest, n);
            await this.access.log(m, n.id, NeedAction.ESCALATED, null, { level: lvl.level, payload: { to } });
            return { kind: 'escalate' as const, n, lvl, to };
          }
          return null;
        });
        if (!action) continue;
        if (action.kind === 'remind') await this.announce(action.n.id, 'fr', { reminder: true });
        else {
          await this.announce(action.n.id, 'fr', { escalated: true });
          const extra = action.to.filter((id) => !action.lvl.approverIds.includes(id) && !action.lvl.substituteIds.includes(id));
          if (extra.length) await this.access.notify(extra, 'approval_escalated', this.params(action.n), this.data(action.n), 'fr');
        }
      } catch (e: any) {
        this.logger.warn(`Relance état de besoin ${n0.id} : ${e?.message}`);
      }
    }
  }

  /** Relance manuelle du niveau en cours (demandeur ou administrateur) */
  async remindNow(id: string, user: UserEntity, ctx: NeedContext, lang: string) {
    const n = await this.m.findOne(NeedRequest, { where: { id } });
    if (!n) throw new NotFoundException(this.t('needs.not_found', lang));
    if (n.status !== NeedStatus.PENDING) throw new BadRequestException(this.t('needs.not_pending', lang));
    if (n.requesterId !== user.id && !this.access.isAdmin(ctx)) throw new ForbiddenException(this.t('needs.forbidden', lang));
    const minGap = this.access.envNum('NEEDS_MANUAL_REMINDER_MINUTES', 30, 1) * 60000;
    const last: any[] = await this.m.query(
      "SELECT MAX(createdAt) AS at FROM bo_need_logs WHERE needId = ? AND action = 'REMINDED'",
      [n.id],
    );
    if (last?.[0]?.at && Date.now() - new Date(last[0].at).getTime() < minGap) {
      throw new BadRequestException(this.t('needs.reminder_too_soon', lang, { minutes: Math.round(minGap / 60000) }));
    }
    await this.access.log(this.m, n.id, NeedAction.REMINDED, user, { level: n.currentLevel, payload: { manual: true } });
    await this.announce(n.id, lang, { reminder: true });
    return n;
  }

  /** Demandes en attente de MA décision (niveau en cours seulement) */
  async inboxIds(companyId: string, userId: string): Promise<string[]> {
    const rows: any[] = await this.m.query(
      "SELECT id, levels, currentLevel, requesterId FROM bo_need_requests WHERE companyId = ? AND status = 'PENDING' AND JSON_SEARCH(levels, 'one', ?) IS NOT NULL",
      [companyId, userId],
    );
    const absentRows: any[] = await this.m.query(
      'SELECT userId FROM bo_need_members WHERE companyId = ? AND delegateId = ? AND unavailableUntil >= NOW() AND (unavailableFrom IS NULL OR unavailableFrom <= NOW())',
      [companyId, userId],
    );
    const iReplace = new Set(absentRows.map((r) => r.userId));
    const out: string[] = [];
    for (const r of rows) {
      const levels: NeedLevelState[] = typeof r.levels === 'string' ? JSON.parse(r.levels) : r.levels;
      const lvl = levels?.find((l) => l.level === r.currentLevel);
      if (!lvl || r.requesterId === userId || lvl.approvals.some((a) => a.userId === userId)) continue;
      if (lvl.approverIds.includes(userId) || lvl.substituteIds.includes(userId)) out.push(r.id);
    }
    if (iReplace.size) {
      const more: any[] = await this.m.query(
        "SELECT id, levels, currentLevel FROM bo_need_requests WHERE companyId = ? AND status = 'PENDING'",
        [companyId],
      );
      for (const r of more) {
        const levels: NeedLevelState[] = typeof r.levels === 'string' ? JSON.parse(r.levels) : r.levels;
        const lvl = levels?.find((l) => l.level === r.currentLevel);
        if (lvl?.approverIds.some((id) => iReplace.has(id)) && !out.includes(r.id)) out.push(r.id);
      }
    }
    return out;
  }

  /** Ids des validateurs d'une liste de demandes */
  validatorIds(n: NeedRequest): string[] {
    return [...new Set((n.levels ?? []).flatMap((l) => [...l.approverIds, ...l.substituteIds]))];
  }

  async byIds(ids: string[]): Promise<NeedRequest[]> {
    return ids.length ? this.m.find(NeedRequest, { where: { id: In(ids) } }) : [];
  }

  isFinanceMember(ctx: NeedContext) {
    return ctx.role === NeedMemberRole.FINANCE || ctx.role === NeedMemberRole.ADMIN;
  }
}
