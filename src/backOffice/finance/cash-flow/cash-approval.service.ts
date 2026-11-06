import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Brackets, EntityManager, In } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { FcmService } from 'src/notification/fcm.service';
import { NotificationsGateway } from 'src/notification/notifications.gateway';
import { normalizeChannels } from 'src/notification/utils/platform-channel';
import { isCompanyOwner, isPlatformAdmin, pageParams } from 'src/backOffice/logistics/common/logistics-access';
import {
  CashApprovalAction,
  CashApprovalLevelStatus,
  CashApprovalScope,
  CashApprovalStatus,
  CashApprovalTarget,
  CashDirection,
  FinanceRole,
} from './common/cash-flow.enums';
import { CashFlowAccessService, FinanceContext, RateCache, round2 } from './common/cash-flow-access.service';
import { CashApprovalLevelConfig, CashApprovalRule } from './entities/cash-approval-rule.entity';
import { CashApproval, CashApprovalLevelState, CashApprovalStep } from './entities/cash-approval.entity';
import { CashAccount } from './entities/cash-account.entity';
import { CashCategory } from './entities/cash-category.entity';
import {
  BulkCashApprovalDto,
  CashApprovalCommentDto,
  CashApprovalDecisionDto,
  CashApprovalQueryDto,
  CashApprovalRejectDto,
  CreateCashApprovalRuleDto,
  SimulateCashApprovalDto,
  UpdateCashApprovalRuleDto,
} from './dto/cash-flow.dto';
import { CashFlowService } from './cash-flow.service';

/** Circuit calculé pour une opération (avant création de la demande) */
export type CashApprovalPlan = {
  ruleId: string | null;
  ruleName: string | null;
  allowSelfApproval: boolean;
  amountUsd: number | null;
  levels: CashApprovalLevelState[];
};

export type CashApprovalPlanInput = {
  scope: CashApprovalScope.IN | CashApprovalScope.OUT | CashApprovalScope.TRANSFER;
  amount: number;
  currency: string;
  categoryId?: string | null;
  accountIds?: string[];
};

export type CashApprovalTargetInput = {
  type: CashApprovalTarget;
  id: string;
  reference: string;
  direction: CashDirection | null;
  amount: number;
  currency: string;
  summary?: string | null;
};

/** Modèles prêts à l'emploi (POST approval-rules/templates) */
const RULE_TEMPLATES: Record<string, Omit<CreateCashApprovalRuleDto, 'companyId'>> = {
  small_expenses: {
    name: 'Petites dépenses',
    description: 'Sorties jusqu’à 500 USD : validation par un responsable financier',
    scope: CashApprovalScope.OUT,
    minAmount: 0,
    maxAmount: 500,
    currency: 'USD',
    applyToManagers: false,
    levels: [{ name: 'Responsable financier', approverRoles: ['MANAGER'], minApprovals: 1, call: false }],
  },
  large_expenses: {
    name: 'Dépenses importantes',
    description: 'Sorties à partir de 500 USD : responsable financier puis direction',
    scope: CashApprovalScope.OUT,
    minAmount: 500,
    currency: 'USD',
    applyToManagers: true,
    levels: [
      { name: 'Responsable financier', approverRoles: ['MANAGER'], minApprovals: 1, call: true },
      { name: 'Direction générale', approverRoles: ['OWNER'], minApprovals: 1, call: true },
    ],
  },
  transfers: {
    name: 'Transferts entre comptes',
    description: 'Transferts à partir de 1 000 USD : responsable financier puis direction',
    scope: CashApprovalScope.TRANSFER,
    minAmount: 1000,
    currency: 'USD',
    applyToManagers: true,
    levels: [
      { name: 'Responsable financier', approverRoles: ['MANAGER'], minApprovals: 1, call: true },
      { name: 'Direction générale', approverRoles: ['OWNER'], minApprovals: 1, call: true },
    ],
  },
};

/**
 * ✅ CIRCUIT DE VALIDATION DE LA TRÉSORERIE (plusieurs niveaux)
 *
 *  - Règles par entreprise : type d'opération (sorties, entrées, transferts), seuils de montant (toute devise,
 *    conversion exchange_rates), rubriques, comptes ; niveaux successifs (personnes et / ou rôles), nombre de
 *    validations par niveau.
 *  - Chaque niveau qui commence APPELLE ses validateurs (sonnerie sur le téléphone / le back-office), avec
 *    notification enregistrée ; la sonnerie s'arrête dès qu'un validateur ouvre ou décide.
 *  - Relances automatiques sans réponse, puis escalade vers les responsables supérieurs.
 *  - Dernier niveau validé → le mouvement / transfert est validé (contrôle du solde à ce moment).
 *  - Refus à n'importe quel niveau → opération refusée ; historique complet de chaque action.
 *  - Sans règle : fonctionnement d'avant (seuil CASH_FLOW_APPROVAL_THRESHOLD, validation par un responsable).
 */
@Injectable()
export class CashApprovalService {
  private readonly logger = new Logger(CashApprovalService.name);

  constructor(
    private readonly access: CashFlowAccessService,
    private readonly fcm: FcmService,
    @Inject(forwardRef(() => NotificationsGateway)) private readonly gateway: NotificationsGateway,
    @Inject(forwardRef(() => CashFlowService)) private readonly cashFlow: CashFlowService,
  ) { }

  private get m() {
    return this.access.m;
  }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.access.t(key, lang, params);
  }

  // ============================================================
  // RÉGLAGES (.env)
  // ============================================================

  private envNum(key: string, def: number, min = 0) {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v >= min ? v : def;
  }

  /** Relance après N minutes sans réponse (défaut 30) */
  private get reminderMinutes() {
    return this.envNum('CASH_FLOW_REMINDER_MINUTES', 30, 5);
  }

  /** Nombre de relances avant escalade (défaut 3) */
  private get maxReminders() {
    return this.envNum('CASH_FLOW_MAX_REMINDERS', 3, 0);
  }

  /** Durée de la sonnerie (secondes, défaut 45) */
  private get ringSeconds() {
    return this.envNum('CASH_FLOW_CALL_RING_SECONDS', 45, 10);
  }

  /** Appels activés (CASH_FLOW_CALL=false pour n'envoyer que des notifications) */
  private get callEnabled() {
    return String(process.env.CASH_FLOW_CALL ?? 'true').toLowerCase() !== 'false';
  }

  /** Applications qui sonnent (défaut : back-office Favor Group + application mobile) */
  private get callChannels() {
    return normalizeChannels(String(process.env.CASH_FLOW_CALL_CHANNELS ?? 'group,mobile').split(','));
  }

  private callId(approvalId: string, level: number) {
    return `cashapp-${approvalId}-${level}`;
  }

  // ============================================================
  // OUTILS
  // ============================================================

  private async people(ids: string[]): Promise<Map<string, { id: string; fullName: string | null; phone: string | null; image: string | null }>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const out = new Map<string, any>();
    if (!unique.length) return out;
    const rows: any[] = await this.m.query(
      `SELECT id, fullName, phone, image FROM users WHERE id IN (${unique.map(() => '?').join(',')})`,
      unique,
    );
    for (const r of rows) out.set(r.id, { id: r.id, fullName: r.fullName ?? null, phone: r.phone ?? null, image: r.image ?? null });
    return out;
  }

  private async ownerIds(companyId: string, m: EntityManager = this.m): Promise<string[]> {
    const rows: { userId: string }[] = await m.query(
      'SELECT `userId` FROM `user_has_company` WHERE `companyId` = ? AND `isOwner` = 1',
      [companyId],
    );
    return rows.map((r) => r.userId);
  }

  private async log(
    m: EntityManager,
    approvalId: string,
    level: number,
    action: CashApprovalAction,
    userId: string | null,
    comment?: string | null,
    payload?: Record<string, any> | null,
  ) {
    await m.save(
      CashApprovalStep,
      m.create(CashApprovalStep, { approvalId, level, action, userId, comment: comment ?? null, payload: payload ?? null }),
    );
  }

  private current(a: CashApproval): CashApprovalLevelState | null {
    return a.levels.find((l) => l.level === a.currentLevel) ?? null;
  }

  private async canManage(user: UserEntity, companyId: string): Promise<boolean> {
    const { role } = await this.access.roleOf(user, companyId);
    return role === FinanceRole.MANAGER;
  }

  private async isOwnerOrAdmin(user: UserEntity, companyId: string): Promise<boolean> {
    return isPlatformAdmin(user) || (await isCompanyOwner(this.access.dataSource, user, companyId));
  }

  /** Voir une demande : équipe finance, demandeur, validateurs (tous niveaux), personnes d'escalade */
  private async assertCanView(a: CashApproval, user: UserEntity, lang: string) {
    if (a.requestedById === user.id) return;
    if (a.levels.some((l) => l.approverIds.includes(user.id) || l.escalateToIds.includes(user.id))) return;
    const { role } = await this.access.roleOf(user, a.companyId);
    if (role) return;
    throw new ForbiddenException(this.t('cash_flow.approval.forbidden', lang));
  }

  // ============================================================
  // CALCUL DU CIRCUIT
  // ============================================================

  /** Validateurs d'un niveau (personnes + rôles), demandeur exclu sauf auto-validation permise */
  private async resolveLevel(
    companyId: string,
    cfg: CashApprovalLevelConfig,
    index: number,
    requesterId: string,
    allowSelf: boolean,
    cache: { owners?: string[]; managers?: string[] },
    m: EntityManager,
  ): Promise<CashApprovalLevelState> {
    const ids = new Set<string>(cfg.approverIds ?? []);
    const roles = (cfg.approverRoles ?? []).map((r) => String(r).toUpperCase());
    if (!ids.size && !roles.length) roles.push('MANAGER');
    if (roles.includes('OWNER')) {
      cache.owners ??= await this.ownerIds(companyId, m);
      cache.owners.forEach((id) => ids.add(id));
    }
    if (roles.includes('MANAGER')) {
      cache.managers ??= await this.access.managerIds(companyId);
      cache.managers.forEach((id) => ids.add(id));
    }

    const requesterIn = ids.has(requesterId);
    let status = CashApprovalLevelStatus.WAITING;
    if (requesterIn && allowSelf) {
      status = CashApprovalLevelStatus.SKIPPED; // le demandeur a l'autorité de ce niveau
    } else {
      ids.delete(requesterId);
      if (!ids.size) {
        // Personne d'autre à ce niveau : les propriétaires de l'entreprise prennent le relais
        cache.owners ??= await this.ownerIds(companyId, m);
        cache.owners.filter((id) => id !== requesterId).forEach((id) => ids.add(id));
      }
      if (!ids.size) status = CashApprovalLevelStatus.SKIPPED; // aucun validateur possible
    }
    const approverIds = [...ids];
    return {
      level: index + 1,
      name: cfg.name,
      minApprovals: Math.max(1, Math.min(Number(cfg.minApprovals) || 1, approverIds.length || 1)),
      call: cfg.call !== false,
      reminderMinutes: Number(cfg.reminderMinutes) || this.reminderMinutes,
      escalateToIds: (cfg.escalateToIds ?? []).filter((id) => id !== requesterId),
      approverIds,
      approverRoles: roles,
      configuredApproverIds: cfg.approverIds ?? [],
      status,
      approvedBy: [],
      startedAt: null,
      completedAt: null,
      reminders: 0,
      escalatedAt: null,
    };
  }

  /** Règle applicable (la plus prioritaire, puis le seuil le plus haut) */
  private async matchRule(ctx: FinanceContext, input: CashApprovalPlanInput, m: EntityManager): Promise<CashApprovalRule | null> {
    const rules = await m.find(CashApprovalRule, { where: { companyId: ctx.companyId, isActive: true } });
    if (!rules.length) return null;
    const rc = new RateCache(m);
    const isManager = ctx.role === FinanceRole.MANAGER;
    const matched: CashApprovalRule[] = [];
    for (const r of rules) {
      if (r.scope !== CashApprovalScope.ALL && r.scope !== input.scope) continue;
      if (!r.applyToManagers && isManager) continue;
      if (r.categoryIds?.length && (!input.categoryId || !r.categoryIds.includes(input.categoryId))) continue;
      if (r.accountIds?.length && !(input.accountIds ?? []).some((id) => r.accountIds!.includes(id))) continue;
      const amt = await rc.convert(input.amount, input.currency, r.currency || 'USD');
      // Taux manquant : la règle s'applique (prudence : mieux vaut une validation de trop)
      if (amt !== null) {
        if (amt < Number(r.minAmount || 0)) continue;
        if (r.maxAmount != null && amt >= Number(r.maxAmount)) continue;
      }
      matched.push(r);
    }
    matched.sort((a, b) => b.priority - a.priority || Number(b.minAmount) - Number(a.minAmount));
    return matched[0] ?? null;
  }

  /**
   * Circuit d'une opération : null = pas de validation (mouvement validé tout de suite).
   *  - règle trouvée → ses niveaux ;
   *  - sinon fonctionnement d'avant : caissier au-dessus du seuil → 1 niveau « Responsable financier ».
   * Si tous les niveaux sont validés d'office (demandeur habilité), pas de validation.
   */
  async plan(ctx: FinanceContext, input: CashApprovalPlanInput, requester: UserEntity, m: EntityManager = this.m): Promise<CashApprovalPlan | null> {
    const rule = await this.matchRule(ctx, input, m);
    let configs: CashApprovalLevelConfig[];
    let allowSelf = false;
    if (rule) {
      configs = rule.levels ?? [];
      allowSelf = !!rule.allowSelfApproval;
    } else {
      if (!(await this.access.needsApproval(ctx, input.amount, input.currency))) return null;
      configs = [{ name: this.t('cash_flow.approval.default_level', 'fr'), approverRoles: ['MANAGER'], minApprovals: 1, call: true }];
    }
    const cache: { owners?: string[]; managers?: string[] } = {};
    const levels: CashApprovalLevelState[] = [];
    for (let i = 0; i < configs.length; i++) {
      levels.push(await this.resolveLevel(ctx.companyId, configs[i], i, requester.id, allowSelf, cache, m));
    }
    if (!levels.some((l) => l.status === CashApprovalLevelStatus.WAITING)) return null;
    const amountUsd = await new RateCache(m).convert(input.amount, input.currency, 'USD');
    return { ruleId: rule?.id ?? null, ruleName: rule?.name ?? null, allowSelfApproval: allowSelf, amountUsd, levels };
  }

  /** Démarre le premier niveau non validé d'office */
  private startNext(a: CashApproval, fromLevel = 0): CashApprovalLevelState | null {
    const now = new Date().toISOString();
    const next = a.levels.find((l) => l.level > fromLevel && l.status === CashApprovalLevelStatus.WAITING) ?? null;
    if (next) {
      next.status = CashApprovalLevelStatus.PENDING;
      next.startedAt = now;
      a.currentLevel = next.level;
      a.currentApproverIds = next.approverIds;
      a.levelStartedAt = new Date();
    } else {
      a.currentLevel = 0;
      a.currentApproverIds = [];
    }
    return next;
  }

  /** Crée la demande (dans la transaction de création de l'opération). Appeler announce() après. */
  async submit(m: EntityManager, plan: CashApprovalPlan, target: CashApprovalTargetInput, requester: UserEntity, companyId: string): Promise<CashApproval> {
    const a = m.create(CashApproval, {
      companyId,
      targetType: target.type,
      targetId: target.id,
      reference: target.reference,
      direction: target.direction,
      amount: round2(target.amount),
      currency: target.currency,
      amountUsd: plan.amountUsd,
      summary: target.summary ? String(target.summary).slice(0, 255) : null,
      ruleId: plan.ruleId,
      ruleName: plan.ruleName,
      allowSelfApproval: plan.allowSelfApproval,
      levels: plan.levels,
      status: CashApprovalStatus.PENDING,
      requestedById: requester.id,
    });
    for (const l of a.levels) if (l.status === CashApprovalLevelStatus.SKIPPED) l.completedAt = new Date().toISOString();
    this.startNext(a);
    const saved = await m.save(CashApproval, a);
    await this.log(m, saved.id, 0, CashApprovalAction.SUBMITTED, requester.id, null, {
      ruleId: plan.ruleId,
      ruleName: plan.ruleName,
      levels: plan.levels.map((l) => ({ level: l.level, name: l.name, status: l.status, approvers: l.approverIds.length })),
    });
    for (const l of saved.levels.filter((x) => x.status === CashApprovalLevelStatus.SKIPPED)) {
      await this.log(m, saved.id, l.level, CashApprovalAction.AUTO_APPROVED, requester.id, null, { reason: l.approverIds.length ? 'SELF' : 'NO_APPROVER' });
    }
    return saved;
  }

  /** Demande en cours pour une opération */
  async pendingFor(type: CashApprovalTarget, targetId: string, m: EntityManager = this.m): Promise<CashApproval | null> {
    return m.findOne(CashApproval, { where: { targetType: type, targetId, status: CashApprovalStatus.PENDING } });
  }

  // ============================================================
  // NOTIFICATIONS / APPELS
  // ============================================================

  private async payloadOf(a: CashApproval) {
    return {
      category: 'finance',
      screen: 'cash_approval',
      approvalId: a.id,
      companyId: a.companyId,
      targetType: a.targetType,
      targetId: a.targetId,
      ...(a.targetType === CashApprovalTarget.TRANSACTION ? { transactionId: a.targetId } : { transferId: a.targetId }),
      reference: a.reference,
      amount: Number(a.amount),
      currency: a.currency,
      level: a.currentLevel,
      levelsCount: a.levels.length,
    };
  }

  /** Les validateurs du niveau en cours sont appelés + notifiés ; le demandeur suit l'avancement */
  async announce(approvalId: string, lang: string, opts: { reminder?: boolean; byUserId?: string | null } = {}) {
    try {
      const a = await this.m.findOne(CashApproval, { where: { id: approvalId } });
      if (!a || a.status !== CashApprovalStatus.PENDING) return;
      const lvl = this.current(a);
      if (!lvl) return;
      const requester = a.requestedById ? (await this.people([a.requestedById])).get(a.requestedById) : null;
      const params = {
        reference: a.reference,
        amount: Number(a.amount),
        currency: a.currency,
        level: lvl.level,
        levels: a.levels.length,
        levelName: lvl.name,
        name: requester?.fullName || '',
        summary: a.summary || '',
      };
      const data = await this.payloadOf(a);
      const targets = lvl.approverIds.filter((id) => !lvl.approvedBy.includes(id));
      if (!targets.length) return;
      const key = opts.reminder ? 'approval_reminder' : 'approval_request';

      // Notification enregistrée + push
      await this.access.notify(targets, key, params, { ...data, event: key }, lang);

      // Événement temps réel pour le back-office (sonnerie dans l'interface)
      for (const id of targets) {
        void this.gateway
          .emitToUserChannels(id, 'finance:approval-call', { ...data, ...params, ringSeconds: this.ringSeconds, reminder: !!opts.reminder }, undefined)
          .catch(() => undefined);
      }

      // Appel (sonnerie) sur le téléphone / le navigateur
      if (lvl.call && this.callEnabled) {
        const title = this.t('cash_flow.notif.approval_call.title', lang, params);
        const body = this.t('cash_flow.notif.approval_call.body', lang, params);
        void this.fcm
          .sendCallToUsers(
            targets,
            title,
            body,
            { type: 'finance', event: 'approval_call', ...data },
            {
              callId: this.callId(a.id, lvl.level),
              ttlSeconds: this.ringSeconds,
              androidChannelId: process.env.CASH_FLOW_CALL_ANDROID_CHANNEL_ID || process.env.RIDE_CALL_ANDROID_CHANNEL_ID || undefined,
              iosSound: process.env.CASH_FLOW_CALL_IOS_SOUND || undefined,
              androidSound: process.env.CASH_FLOW_CALL_ANDROID_SOUND || 'default',
              iosCategory: 'FINANCE_CALL',
              channels: this.callChannels,
            },
          )
          .then((reached) =>
            this.log(this.m, a.id, lvl.level, CashApprovalAction.CALLED, opts.byUserId ?? null, null, { targets, reached }).catch(() => undefined),
          )
          .catch((e) => this.logger.warn(`Appel validation ${a.reference} : ${e?.message}`));
      }
      await this.m.update(CashApproval, { id: a.id }, { lastNotifiedAt: new Date() });

      // Demandeur : niveau suivant atteint
      if (!opts.reminder && lvl.level > 1 && a.requestedById) {
        void this.access.notify([a.requestedById], 'approval_progress', params, { ...data, event: 'approval_progress' }, lang);
      }
      this.emitUpdated(a);
    } catch (e: any) {
      this.logger.warn(`Annonce validation ${approvalId} : ${e?.message}`);
    }
  }

  /** Arrête la sonnerie (validateurs du niveau) */
  private stopRinging(a: CashApproval, level: number, userIds: string[], reason: string) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    const callId = this.callId(a.id, level);
    void this.fcm.cancelCallForUsers(ids, callId, reason, { category: 'finance', approvalId: a.id }, this.callChannels).catch(() => undefined);
    for (const id of ids) {
      void this.gateway.emitToUserChannels(id, 'finance:approval-call-cancel', { approvalId: a.id, level, callId, reason }, undefined).catch(() => undefined);
    }
  }

  /** Tous les écrans ouverts (demandeur + validateurs) se mettent à jour */
  private emitUpdated(a: CashApproval) {
    const ids = new Set<string>([a.requestedById ?? '', ...a.levels.flatMap((l) => l.approverIds)]);
    const payload = {
      approvalId: a.id,
      targetType: a.targetType,
      targetId: a.targetId,
      reference: a.reference,
      status: a.status,
      currentLevel: a.currentLevel,
      levels: a.levels.map((l) => ({ level: l.level, name: l.name, status: l.status, approvals: l.approvedBy.length, minApprovals: l.minApprovals })),
    };
    for (const id of ids) {
      if (id) void this.gateway.emitToUserChannels(id, 'finance:approval-updated', payload, undefined).catch(() => undefined);
    }
  }

  // ============================================================
  // DÉCISIONS
  // ============================================================

  private async loadOrFail(id: string, lang: string, m: EntityManager = this.m, lock = false): Promise<CashApproval> {
    const a = await m.findOne(CashApproval, { where: { id }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!a) throw new NotFoundException(this.t('cash_flow.approval.not_found', lang));
    return a;
  }

  /** ✅ Valider le niveau en cours (validateur de ce niveau) */
  async approve(id: string, user: UserEntity, dto: CashApprovalDecisionDto = {}, lang = 'fr') {
    const a0 = await this.loadOrFail(id, lang);
    if (a0.status !== CashApprovalStatus.PENDING) throw new BadRequestException(this.t('cash_flow.approval.not_pending', lang));
    const lvl0 = this.current(a0);
    if (!lvl0 || !lvl0.approverIds.includes(user.id)) throw new ForbiddenException(this.t('cash_flow.approval.not_your_level', lang));
    if (lvl0.approvedBy.includes(user.id)) throw new BadRequestException(this.t('cash_flow.approval.already_approved', lang));

    // Dernière validation du dernier niveau → l'opération est validée d'abord (contrôle du solde)
    const completesLevel = lvl0.approvedBy.length + 1 >= lvl0.minApprovals;
    const isLast = completesLevel && !a0.levels.some((l) => l.level > lvl0.level && l.status === CashApprovalLevelStatus.WAITING);
    if (isLast) await this.cashFlow.finalizeApprovedTarget(a0.targetType, a0.targetId, user, lang);

    const result = await this.access.dataSource.transaction(async (m) => {
      const a = await this.loadOrFail(id, lang, m, true);
      if (a.status !== CashApprovalStatus.PENDING) throw new BadRequestException(this.t('cash_flow.approval.not_pending', lang));
      const lvl = this.current(a)!;
      if (lvl.level !== lvl0.level || lvl.approvedBy.includes(user.id)) throw new BadRequestException(this.t('cash_flow.approval.already_approved', lang));
      lvl.approvedBy = [...lvl.approvedBy, user.id];
      await this.log(m, a.id, lvl.level, CashApprovalAction.APPROVED, user.id, dto.comment, { approvals: lvl.approvedBy.length, minApprovals: lvl.minApprovals });
      let next: CashApprovalLevelState | null = null;
      if (lvl.approvedBy.length >= lvl.minApprovals) {
        lvl.status = CashApprovalLevelStatus.APPROVED;
        lvl.completedAt = new Date().toISOString();
        next = this.startNext(a, lvl.level);
        if (next) {
          await this.log(m, a.id, next.level, CashApprovalAction.LEVEL_STARTED, null, null, { name: next.name, approvers: next.approverIds });
        } else {
          a.status = CashApprovalStatus.APPROVED;
          a.decidedById = user.id;
          a.completedAt = new Date();
          await this.log(m, a.id, lvl.level, CashApprovalAction.COMPLETED, user.id);
        }
      }
      await m.save(CashApproval, a);
      return { a, lvl, next };
    });

    const { a, lvl, next } = result;
    // Sonnerie : arrêtée pour ce validateur, ou pour tout le niveau s'il est terminé
    this.stopRinging(a, lvl.level, lvl.status === CashApprovalLevelStatus.APPROVED ? lvl.approverIds : [user.id], 'ANSWERED');
    if (next) void this.announce(a.id, lang, { byUserId: user.id });
    if (a.status === CashApprovalStatus.APPROVED) {
      // (transfert : le demandeur est déjà prévenu par la validation du transfert)
      const requester = a.targetType === CashApprovalTarget.TRANSACTION ? a.requestedById ?? '' : '';
      const ids = [requester, ...a.levels.flatMap((l) => l.approvedBy)].filter((x) => x && x !== user.id);
      void this.access.notify(ids, 'validated', { reference: a.reference, amount: Number(a.amount), currency: a.currency }, { ...(await this.payloadOf(a)), event: 'validated' }, lang);
    }
    this.emitUpdated(a);
    return {
      message: this.t(a.status === CashApprovalStatus.APPROVED ? 'cash_flow.approval.completed' : 'cash_flow.approval.approved', lang, { level: lvl.level, name: lvl.name }),
      data: await this.detailData(a.id, user),
    };
  }

  /** ✅ Refuser (validateur du niveau en cours, ou propriétaire / admin) : l'opération est refusée */
  async reject(id: string, user: UserEntity, dto: CashApprovalRejectDto, lang = 'fr') {
    const a0 = await this.loadOrFail(id, lang);
    if (a0.status !== CashApprovalStatus.PENDING) throw new BadRequestException(this.t('cash_flow.approval.not_pending', lang));
    const lvl0 = this.current(a0);
    const isApprover = !!lvl0?.approverIds.includes(user.id);
    if (!isApprover && !(await this.isOwnerOrAdmin(user, a0.companyId))) {
      throw new ForbiddenException(this.t('cash_flow.approval.not_your_level', lang));
    }
    await this.cashFlow.rejectApprovedTarget(a0.targetType, a0.targetId, dto.reason, user, lang);

    const a = await this.access.dataSource.transaction(async (m) => {
      const row = await this.loadOrFail(id, lang, m, true);
      const lvl = this.current(row);
      if (lvl) {
        lvl.status = CashApprovalLevelStatus.REJECTED;
        lvl.completedAt = new Date().toISOString();
      }
      row.status = CashApprovalStatus.REJECTED;
      row.decidedById = user.id;
      row.decisionReason = dto.reason;
      row.completedAt = new Date();
      row.currentApproverIds = [];
      await this.log(m, row.id, lvl?.level ?? 0, CashApprovalAction.REJECTED, user.id, dto.reason);
      return m.save(CashApproval, row);
    });

    if (lvl0) this.stopRinging(a, lvl0.level, lvl0.approverIds, 'REJECTED');
    // Le demandeur est prévenu par le refus de l'opération ; ici : les validateurs des niveaux précédents
    const ids = a.levels.flatMap((l) => l.approvedBy).filter((x) => x && x !== user.id && x !== a.requestedById);
    void this.access.notify(ids, 'rejected', { reference: a.reference, reason: dto.reason }, { ...(await this.payloadOf(a)), event: 'rejected' }, lang);
    this.emitUpdated(a);
    return { message: this.t('cash_flow.approval.rejected', lang), data: await this.detailData(a.id, user) };
  }

  /** ✅ Valider d'office tous les niveaux restants (propriétaire de l'entreprise / admin plateforme) */
  async force(id: string, user: UserEntity, dto: CashApprovalDecisionDto = {}, lang = 'fr') {
    const a0 = await this.loadOrFail(id, lang);
    if (a0.status !== CashApprovalStatus.PENDING) throw new BadRequestException(this.t('cash_flow.approval.not_pending', lang));
    if (!(await this.isOwnerOrAdmin(user, a0.companyId))) throw new ForbiddenException(this.t('cash_flow.approval.owner_only', lang));
    const lvl0 = this.current(a0);
    await this.cashFlow.finalizeApprovedTarget(a0.targetType, a0.targetId, user, lang);
    const a = await this.access.dataSource.transaction(async (m) => {
      const row = await this.loadOrFail(id, lang, m, true);
      const now = new Date().toISOString();
      for (const l of row.levels) {
        if (l.status === CashApprovalLevelStatus.PENDING || l.status === CashApprovalLevelStatus.WAITING) {
          l.status = CashApprovalLevelStatus.APPROVED;
          l.approvedBy = [...new Set([...l.approvedBy, user.id])];
          l.completedAt = now;
        }
      }
      row.status = CashApprovalStatus.APPROVED;
      row.decidedById = user.id;
      row.decisionReason = dto.comment ?? null;
      row.completedAt = new Date();
      row.currentLevel = 0;
      row.currentApproverIds = [];
      await this.log(m, row.id, lvl0?.level ?? 0, CashApprovalAction.FORCED, user.id, dto.comment);
      return m.save(CashApproval, row);
    });
    if (lvl0) this.stopRinging(a, lvl0.level, lvl0.approverIds, 'ANSWERED');
    const ids = [a.targetType === CashApprovalTarget.TRANSACTION ? a.requestedById ?? '' : ''].filter((x) => x && x !== user.id);
    void this.access.notify(ids, 'validated', { reference: a.reference, amount: Number(a.amount), currency: a.currency }, { ...(await this.payloadOf(a)), event: 'validated' }, lang);
    this.emitUpdated(a);
    return { message: this.t('cash_flow.approval.completed', lang), data: await this.detailData(a.id, user) };
  }

  /** ✅ Retirer la demande (demandeur ou responsable financier) : l'opération est annulée */
  async cancel(id: string, user: UserEntity, dto: CashApprovalRejectDto, lang = 'fr') {
    const a0 = await this.loadOrFail(id, lang);
    if (a0.status !== CashApprovalStatus.PENDING) throw new BadRequestException(this.t('cash_flow.approval.not_pending', lang));
    if (a0.requestedById !== user.id && !(await this.canManage(user, a0.companyId))) {
      throw new ForbiddenException(this.t('cash_flow.approval.forbidden', lang));
    }
    await this.cashFlow.withdrawApprovedTarget(a0.targetType, a0.targetId, dto.reason, user, lang);
    const lvl0 = this.current(a0);
    const a = await this.access.dataSource.transaction(async (m) => {
      const row = await this.loadOrFail(id, lang, m, true);
      row.status = CashApprovalStatus.CANCELLED;
      row.decidedById = user.id;
      row.decisionReason = dto.reason;
      row.completedAt = new Date();
      row.currentApproverIds = [];
      await this.log(m, row.id, row.currentLevel, CashApprovalAction.CANCELLED, user.id, dto.reason);
      return m.save(CashApproval, row);
    });
    if (lvl0) this.stopRinging(a, lvl0.level, lvl0.approverIds, 'CANCELLED');
    this.emitUpdated(a);
    return { message: this.t('cash_flow.approval.cancelled', lang), data: await this.detailData(a.id, user) };
  }

  /** ✅ Le validateur a ouvert la demande : sa sonnerie s'arrête (sur tous ses appareils) */
  async seen(id: string, user: UserEntity, lang = 'fr') {
    const a = await this.loadOrFail(id, lang);
    const lvl = this.current(a);
    if (a.status === CashApprovalStatus.PENDING && lvl?.approverIds.includes(user.id)) {
      this.stopRinging(a, lvl.level, [user.id], 'SEEN');
      const already = await this.m.count(CashApprovalStep, { where: { approvalId: a.id, level: lvl.level, action: CashApprovalAction.SEEN, userId: user.id } });
      if (!already) await this.log(this.m, a.id, lvl.level, CashApprovalAction.SEEN, user.id);
    }
    return { message: this.t('cash_flow.approval.detail', lang), data: await this.detailData(a.id, user) };
  }

  /** ✅ Relancer (rappeler) les validateurs du niveau en cours — demandeur ou responsable */
  async remind(id: string, user: UserEntity, lang = 'fr') {
    const a = await this.loadOrFail(id, lang);
    if (a.status !== CashApprovalStatus.PENDING) throw new BadRequestException(this.t('cash_flow.approval.not_pending', lang));
    if (a.requestedById !== user.id && !(await this.canManage(user, a.companyId))) {
      throw new ForbiddenException(this.t('cash_flow.approval.forbidden', lang));
    }
    const wait = 5 * 60 * 1000;
    if (a.lastNotifiedAt && Date.now() - new Date(a.lastNotifiedAt).getTime() < wait) {
      throw new BadRequestException(this.t('cash_flow.approval.remind_too_soon', lang, { minutes: 5 }));
    }
    await this.log(this.m, a.id, a.currentLevel, CashApprovalAction.REMINDED, user.id, null, { manual: true });
    await this.announce(a.id, lang, { reminder: true, byUserId: user.id });
    return { message: this.t('cash_flow.approval.reminded', lang), data: await this.detailData(a.id, user) };
  }

  /** ✅ Commentaire (question, précision) — visible dans l'historique, le demandeur est prévenu */
  async comment(id: string, user: UserEntity, dto: CashApprovalCommentDto, lang = 'fr') {
    const a = await this.loadOrFail(id, lang);
    await this.assertCanView(a, user, lang);
    await this.log(this.m, a.id, a.currentLevel, CashApprovalAction.COMMENT, user.id, dto.comment);
    const ids = [a.requestedById ?? '', ...(this.current(a)?.approverIds ?? [])].filter((x) => x && x !== user.id);
    void this.access.notify(ids, 'approval_comment', { reference: a.reference, name: user.fullName || '', comment: dto.comment.slice(0, 120) }, { ...(await this.payloadOf(a)), event: 'approval_comment' }, lang);
    this.emitUpdated(a);
    return { message: this.t('cash_flow.approval.commented', lang), data: await this.detailData(a.id, user) };
  }

  /** ✅ Valider plusieurs demandes d'un coup (celles où l'utilisateur est validateur du niveau en cours) */
  async bulkApprove(dto: BulkCashApprovalDto, user: UserEntity, lang = 'fr') {
    const ok: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of [...new Set(dto.ids)]) {
      try {
        await this.approve(id, user, { comment: dto.comment }, lang);
        ok.push(id);
      } catch (e: any) {
        failed.push({ id, error: e?.response?.message ?? e?.message ?? 'Erreur' });
      }
    }
    return { message: this.t('cash_flow.approval.bulk_approved', lang, { count: ok.length }), data: { approved: ok, failed } };
  }

  /**
   * ✅ Montant modifié pendant la validation : le circuit recommence (nouvelle règle si le seuil change).
   * Appelé par CashFlowService.updateTransaction.
   */
  async restart(ctx: FinanceContext, type: CashApprovalTarget, targetId: string, input: CashApprovalPlanInput, user: UserEntity, lang: string) {
    const a = await this.pendingFor(type, targetId);
    if (!a) return;
    const requester = (await this.m.findOne(UserEntity, { where: { id: a.requestedById ?? user.id } })) ?? user;
    const plan = await this.plan({ ...ctx, role: (await this.access.roleOf(requester, ctx.companyId)).role ?? FinanceRole.CASHIER }, input, requester);
    const old = this.current(a);
    await this.access.dataSource.transaction(async (m) => {
      const row = await this.loadOrFail(a.id, lang, m, true);
      if (plan) {
        row.levels = plan.levels;
        row.ruleId = plan.ruleId;
        row.ruleName = plan.ruleName;
        row.allowSelfApproval = plan.allowSelfApproval;
        row.amountUsd = plan.amountUsd;
      } else {
        // Plus de seuil atteint : on garde le circuit, remis à zéro
        for (const l of row.levels) {
          if (l.status !== CashApprovalLevelStatus.SKIPPED) {
            l.status = CashApprovalLevelStatus.WAITING;
            l.approvedBy = [];
            l.startedAt = null;
            l.completedAt = null;
            l.reminders = 0;
            l.escalatedAt = null;
          }
        }
      }
      row.amount = round2(input.amount);
      row.currency = input.currency;
      this.startNext(row);
      await this.log(m, row.id, row.currentLevel, CashApprovalAction.RESTARTED, user.id, null, { amount: row.amount, currency: row.currency, ruleName: row.ruleName });
      await m.save(CashApproval, row);
    });
    if (old) this.stopRinging(a, old.level, old.approverIds, 'RESTARTED');
    void this.announce(a.id, lang, { byUserId: user.id });
  }

  /** Opération validée / refusée / annulée en dehors du circuit (ex. ancienne route) : la demande suit */
  async closeForTarget(type: CashApprovalTarget, targetId: string, status: CashApprovalStatus, user: UserEntity, reason?: string | null) {
    const a = await this.pendingFor(type, targetId);
    if (!a) return;
    const lvl = this.current(a);
    a.status = status;
    a.decidedById = user.id;
    a.decisionReason = reason ?? null;
    a.completedAt = new Date();
    a.currentApproverIds = [];
    await this.m.save(CashApproval, a);
    await this.log(this.m, a.id, a.currentLevel, status === CashApprovalStatus.APPROVED ? CashApprovalAction.FORCED : CashApprovalAction.CANCELLED, user.id, reason ?? null);
    if (lvl) this.stopRinging(a, lvl.level, lvl.approverIds, 'CLOSED');
    this.emitUpdated(a);
  }

  // ============================================================
  // RELANCES AUTOMATIQUES + ESCALADE (toutes les 2 minutes)
  // ============================================================

  @Cron('0 */2 * * * *')
  async reminders() {
    if (String(process.env.CASH_FLOW_REMINDERS ?? 'true').toLowerCase() === 'false') return;
    let list: CashApproval[] = [];
    try {
      list = await this.m.find(CashApproval, { where: { status: CashApprovalStatus.PENDING }, take: 500, order: { levelStartedAt: 'ASC' } });
    } catch {
      return; // table absente (script SQL pas encore exécuté)
    }
    const now = Date.now();
    for (const a0 of list) {
      try {
        const lvl0 = this.current(a0);
        if (!lvl0?.startedAt) continue;
        const started = new Date(lvl0.startedAt).getTime();
        const every = Math.max(5, lvl0.reminderMinutes || this.reminderMinutes) * 60 * 1000;
        const dueReminder = lvl0.reminders < this.maxReminders && now >= started + every * (lvl0.reminders + 1);
        const dueEscalation = !lvl0.escalatedAt && lvl0.reminders >= this.maxReminders && now >= started + every * (this.maxReminders + 1);
        if (!dueReminder && !dueEscalation) continue;

        // Réservation (plusieurs instances pm2) : relu sous verrou
        const action = await this.access.dataSource.transaction(async (m) => {
          const a = await this.loadOrFail(a0.id, 'fr', m, true);
          const lvl = this.current(a);
          if (a.status !== CashApprovalStatus.PENDING || !lvl || lvl.level !== lvl0.level) return null;
          if (dueReminder && lvl.reminders === lvl0.reminders) {
            lvl.reminders += 1;
            await m.save(CashApproval, a);
            await this.log(m, a.id, lvl.level, CashApprovalAction.REMINDED, null, null, { auto: true, count: lvl.reminders });
            return { kind: 'remind' as const, a, lvl };
          }
          if (dueEscalation && !lvl.escalatedAt) {
            lvl.escalatedAt = new Date().toISOString();
            let to = lvl.escalateToIds.length ? lvl.escalateToIds : await this.ownerIds(a.companyId, m);
            to = to.filter((id) => id !== a.requestedById && !lvl.approverIds.includes(id));
            await m.save(CashApproval, a);
            await this.log(m, a.id, lvl.level, CashApprovalAction.ESCALATED, null, null, { to });
            return { kind: 'escalate' as const, a, lvl, to };
          }
          return null;
        });
        if (!action) continue;
        if (action.kind === 'remind') {
          await this.announce(action.a.id, 'fr', { reminder: true });
        } else if (action.to.length) {
          const hours = Math.round(((now - started) / 3600000) * 10) / 10;
          void this.access.notify(
            action.to,
            'approval_escalated',
            { reference: action.a.reference, amount: Number(action.a.amount), currency: action.a.currency, levelName: action.lvl.name, hours },
            { ...(await this.payloadOf(action.a)), event: 'approval_escalated' },
            'fr',
          );
        }
      } catch (e: any) {
        this.logger.warn(`Relance validation ${a0.reference} : ${e?.message}`);
      }
    }
  }

  // ============================================================
  // CONSULTATION
  // ============================================================

  private async serialize(a: CashApproval, viewer: UserEntity, persons?: Map<string, any>) {
    const ids = [a.requestedById ?? '', a.decidedById ?? '', ...a.levels.flatMap((l) => [...l.approverIds, ...l.approvedBy, ...l.escalateToIds])];
    const p = persons ?? (await this.people(ids));
    const lvl = this.current(a);
    return {
      id: a.id,
      companyId: a.companyId,
      targetType: a.targetType,
      targetId: a.targetId,
      reference: a.reference,
      direction: a.direction ?? null,
      amount: Number(a.amount),
      currency: a.currency,
      amountUsd: a.amountUsd != null ? Number(a.amountUsd) : null,
      summary: a.summary ?? null,
      ruleId: a.ruleId ?? null,
      ruleName: a.ruleName ?? null,
      status: a.status,
      currentLevel: a.currentLevel,
      levelsCount: a.levels.length,
      progress: `${a.levels.filter((l) => l.status === CashApprovalLevelStatus.APPROVED || l.status === CashApprovalLevelStatus.SKIPPED).length}/${a.levels.length}`,
      levels: a.levels.map((l) => ({
        level: l.level,
        name: l.name,
        status: l.status,
        minApprovals: l.minApprovals,
        approvals: l.approvedBy.length,
        call: l.call,
        approvers: l.approverIds.map((id) => ({ ...(p.get(id) ?? { id }), approved: l.approvedBy.includes(id) })),
        startedAt: l.startedAt,
        completedAt: l.completedAt,
        reminders: l.reminders,
        escalatedAt: l.escalatedAt,
      })),
      requestedBy: a.requestedById ? p.get(a.requestedById) ?? { id: a.requestedById } : null,
      decidedBy: a.decidedById ? p.get(a.decidedById) ?? { id: a.decidedById } : null,
      decisionReason: a.decisionReason ?? null,
      waitingSince: a.status === CashApprovalStatus.PENDING ? a.levelStartedAt ?? a.createdAt : null,
      completedAt: a.completedAt ?? null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      // Ce que l'utilisateur peut faire (boutons du front)
      can: {
        approve: a.status === CashApprovalStatus.PENDING && !!lvl?.approverIds.includes(viewer.id) && !lvl.approvedBy.includes(viewer.id),
        reject: a.status === CashApprovalStatus.PENDING && !!lvl?.approverIds.includes(viewer.id),
        cancel: a.status === CashApprovalStatus.PENDING && a.requestedById === viewer.id,
        remind: a.status === CashApprovalStatus.PENDING && a.requestedById === viewer.id,
        force: a.status === CashApprovalStatus.PENDING && (await this.isOwnerOrAdmin(viewer, a.companyId)),
      },
    };
  }

  private async detailData(id: string, user: UserEntity) {
    const a = await this.m.findOne(CashApproval, { where: { id } });
    if (!a) return null;
    const steps = await this.m.find(CashApprovalStep, { where: { approvalId: id }, relations: { user: true }, order: { createdAt: 'ASC' } });
    const target =
      a.targetType === CashApprovalTarget.TRANSACTION ? await this.cashFlow.transactionView(a.targetId) : await this.cashFlow.transferView(a.targetId);
    return {
      ...(await this.serialize(a, user)),
      target,
      history: steps.map((s) => ({
        id: s.id,
        level: s.level,
        action: s.action,
        user: s.user ? { id: s.user.id, fullName: s.user.fullName ?? null, image: s.user.image ?? null } : null,
        comment: s.comment ?? null,
        payload: s.payload ?? null,
        createdAt: s.createdAt,
      })),
    };
  }

  async detail(id: string, user: UserEntity, lang = 'fr') {
    const a = await this.loadOrFail(id, lang);
    await this.assertCanView(a, user, lang);
    return { message: this.t('cash_flow.approval.detail', lang), data: await this.detailData(id, user) };
  }

  /** Demande liée à une opération (écran du mouvement / du transfert) */
  async forTarget(type: CashApprovalTarget, targetId: string, user: UserEntity) {
    const a = await this.m.findOne(CashApproval, { where: { targetType: type, targetId }, order: { createdAt: 'DESC' } });
    if (!a) return null;
    return this.serialize(a, user);
  }

  /** ✅ À valider par moi (toutes entreprises, ou une entreprise) */
  async inbox(user: UserEntity, companyId: string | undefined, lang = 'fr') {
    const qb = this.m
      .createQueryBuilder(CashApproval, 'a')
      .where('a.status = :st', { st: CashApprovalStatus.PENDING })
      .andWhere('JSON_CONTAINS(a.currentApproverIds, JSON_QUOTE(:uid))', { uid: user.id })
      .orderBy('a.levelStartedAt', 'ASC');
    if (companyId) qb.andWhere('a.companyId = :c', { c: companyId });
    const rows = (await qb.take(200).getMany()).filter((a) => !this.current(a)?.approvedBy.includes(user.id));
    const p = await this.people(rows.flatMap((a) => [a.requestedById ?? '', ...a.levels.flatMap((l) => l.approverIds)]));
    const data: any[] = [];
    for (const a of rows) data.push(await this.serialize(a, user, p));
    const totals: Record<string, number> = {};
    for (const a of rows) totals[a.currency] = round2((totals[a.currency] ?? 0) + Number(a.amount));
    return { message: this.t('cash_flow.approval.inbox', lang), data, meta: { count: data.length, totals } };
  }

  async list(q: CashApprovalQueryDto, user: UserEntity, lang = 'fr') {
    const { page, limit, skip } = pageParams(q.page, q.limit);
    const qb = this.m.createQueryBuilder(CashApproval, 'a');
    if (q.mine) {
      qb.where('1 = 1');
      if (q.companyId) qb.andWhere('a.companyId = :c', { c: q.companyId });
      if (q.mine === 'requested') qb.andWhere('a.requestedById = :uid', { uid: user.id });
      if (q.mine === 'toApprove') {
        qb.andWhere('a.status = :pst', { pst: CashApprovalStatus.PENDING }).andWhere('JSON_CONTAINS(a.currentApproverIds, JSON_QUOTE(:uid))', { uid: user.id });
      }
      if (q.mine === 'decided') {
        qb.andWhere(
          "a.id IN (SELECT s.approvalId FROM bo_cash_approval_steps s WHERE s.userId = :uid AND s.action IN ('APPROVED','REJECTED','FORCED'))",
          { uid: user.id },
        );
      }
    } else {
      const ctx = await this.access.context(user, q.companyId, lang);
      qb.where('a.companyId = :c', { c: ctx.companyId });
      if (q.requestedById) qb.andWhere('a.requestedById = :rb', { rb: q.requestedById });
    }
    if (q.status) qb.andWhere('a.status = :st', { st: q.status });
    if (q.targetType) qb.andWhere('a.targetType = :tt', { tt: q.targetType });
    if (q.from) qb.andWhere('a.createdAt >= :from', { from: `${q.from} 00:00:00` });
    if (q.to) qb.andWhere('a.createdAt <= :to', { to: `${q.to} 23:59:59` });
    if (q.search) {
      const s = `%${q.search}%`;
      qb.andWhere(new Brackets((w) => w.where('a.reference LIKE :s', { s }).orWhere('a.summary LIKE :s', { s }).orWhere('a.ruleName LIKE :s', { s })));
    }
    const [rows, total] = await qb.orderBy('a.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    const p = await this.people(rows.flatMap((a) => [a.requestedById ?? '', a.decidedById ?? '', ...a.levels.flatMap((l) => l.approverIds)]));
    const data: any[] = [];
    for (const a of rows) data.push(await this.serialize(a, user, p));
    return { message: this.t('cash_flow.approval.list', lang), ...new PaginatedResponseDto(data, total, page, limit) };
  }

  /** ✅ Tableau de bord du circuit : à valider par moi, en attente par niveau, délais, ce mois-ci */
  async stats(user: UserEntity, companyId: string | undefined, lang = 'fr') {
    const mine: any[] = await this.m.query(
      `SELECT a.currency, COUNT(*) AS n, SUM(a.amount) AS total FROM bo_cash_approvals a
        WHERE a.status = 'PENDING' AND JSON_CONTAINS(a.currentApproverIds, JSON_QUOTE(?))${companyId ? ' AND a.companyId = ?' : ''}
        GROUP BY a.currency`,
      companyId ? [user.id, companyId] : [user.id],
    );
    const out: Record<string, any> = {
      toApprove: {
        count: mine.reduce((s, r) => s + Number(r.n || 0), 0),
        byCurrency: mine.map((r) => ({ currency: r.currency, count: Number(r.n || 0), total: round2(Number(r.total || 0)) })),
      },
    };
    const myRequests: any[] = await this.m.query(
      `SELECT a.status, COUNT(*) AS n FROM bo_cash_approvals a WHERE a.requestedById = ?${companyId ? ' AND a.companyId = ?' : ''} GROUP BY a.status`,
      companyId ? [user.id, companyId] : [user.id],
    );
    out.myRequests = Object.fromEntries(myRequests.map((r) => [r.status, Number(r.n || 0)]));

    // Vue entreprise (équipe finance)
    const ctx = await this.access.context(user, companyId, lang).catch(() => null);
    if (ctx) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const [byStatus, pendingLevels, durations, oldest] = await Promise.all([
        this.m.query(
          `SELECT status, COUNT(*) AS n, SUM(COALESCE(amountUsd, 0)) AS usd FROM bo_cash_approvals
            WHERE companyId = ? AND createdAt >= ? GROUP BY status`,
          [ctx.companyId, monthStart],
        ),
        this.m.query(
          `SELECT currentLevel AS level, COUNT(*) AS n FROM bo_cash_approvals WHERE companyId = ? AND status = 'PENDING' GROUP BY currentLevel`,
          [ctx.companyId],
        ),
        this.m.query(
          `SELECT AVG(TIMESTAMPDIFF(MINUTE, createdAt, completedAt)) AS avgMinutes FROM bo_cash_approvals
            WHERE companyId = ? AND status = 'APPROVED' AND completedAt >= ?`,
          [ctx.companyId, monthStart],
        ),
        this.m.query(
          `SELECT id, reference, amount, currency, levelStartedAt FROM bo_cash_approvals
            WHERE companyId = ? AND status = 'PENDING' ORDER BY levelStartedAt ASC LIMIT 5`,
          [ctx.companyId],
        ),
      ]);
      out.company = {
        thisMonth: Object.fromEntries(byStatus.map((r: any) => [r.status, { count: Number(r.n || 0), amountUsd: round2(Number(r.usd || 0)) }])),
        pendingByLevel: pendingLevels.map((r: any) => ({ level: Number(r.level), count: Number(r.n || 0) })),
        averageApprovalHours: durations?.[0]?.avgMinutes != null ? Math.round((Number(durations[0].avgMinutes) / 60) * 10) / 10 : null,
        oldestPending: oldest.map((r: any) => ({ id: r.id, reference: r.reference, amount: Number(r.amount), currency: r.currency, waitingSince: r.levelStartedAt })),
      };
    }
    return { message: this.t('cash_flow.approval.stats', lang), data: out };
  }

  // ============================================================
  // RÈGLES (responsable financier)
  // ============================================================

  private async validateRule(companyId: string, dto: Partial<CreateCashApprovalRuleDto>, lang: string) {
    if (dto.maxAmount != null && dto.minAmount != null && Number(dto.maxAmount) <= Number(dto.minAmount)) {
      throw new BadRequestException(this.t('cash_flow.approval.rule_range', lang));
    }
    const userIds = [...new Set((dto.levels ?? []).flatMap((l) => [...(l.approverIds ?? []), ...(l.escalateToIds ?? [])]))];
    if (userIds.length) {
      const found = await this.people(userIds);
      const missing = userIds.filter((id) => !found.has(id));
      if (missing.length) throw new BadRequestException(this.t('cash_flow.approval.user_not_found', lang, { ids: missing.join(', ') }));
    }
    if (dto.categoryIds?.length) {
      const n = await this.m.count(CashCategory, { where: { id: In(dto.categoryIds), companyId } });
      if (n !== dto.categoryIds.length) throw new BadRequestException(this.t('cash_flow.category_not_found', lang));
    }
    if (dto.accountIds?.length) {
      const n = await this.m.count(CashAccount, { where: { id: In(dto.accountIds), companyId } });
      if (n !== dto.accountIds.length) throw new BadRequestException(this.t('cash_flow.account_not_found', lang));
    }
  }

  private cleanLevels(levels: any[] | undefined): CashApprovalLevelConfig[] {
    return (levels ?? []).map((l) => ({
      name: String(l.name).trim(),
      approverIds: [...new Set<string>(l.approverIds ?? [])],
      approverRoles: [...new Set<string>((l.approverRoles ?? []).map((r: string) => r.toUpperCase()))] as any,
      minApprovals: Math.max(1, Number(l.minApprovals) || 1),
      call: l.call !== false,
      ...(l.reminderMinutes ? { reminderMinutes: Number(l.reminderMinutes) } : {}),
      escalateToIds: [...new Set<string>(l.escalateToIds ?? [])],
    }));
  }

  private async serializeRule(r: CashApprovalRule) {
    const p = await this.people(r.levels.flatMap((l) => [...(l.approverIds ?? []), ...(l.escalateToIds ?? [])]));
    return {
      ...r,
      minAmount: Number(r.minAmount),
      maxAmount: r.maxAmount != null ? Number(r.maxAmount) : null,
      levels: r.levels.map((l, i) => ({
        level: i + 1,
        ...l,
        approvers: (l.approverIds ?? []).map((id) => p.get(id) ?? { id }),
        escalateTo: (l.escalateToIds ?? []).map((id) => p.get(id) ?? { id }),
      })),
    };
  }

  async listRules(user: UserEntity, companyId: string | undefined, lang = 'fr') {
    const ctx = await this.access.context(user, companyId, lang);
    const rules = await this.m.find(CashApprovalRule, { where: { companyId: ctx.companyId }, order: { priority: 'DESC', minAmount: 'ASC', createdAt: 'ASC' } });
    const data: any[] = [];
    for (const r of rules) data.push(await this.serializeRule(r));
    return { message: this.t('cash_flow.approval.rules', lang), data };
  }

  async createRule(dto: CreateCashApprovalRuleDto, user: UserEntity, lang = 'fr') {
    const ctx = await this.access.context(user, dto.companyId, lang, FinanceRole.MANAGER);
    await this.validateRule(ctx.companyId, dto, lang);
    const rule = await this.m.save(
      CashApprovalRule,
      this.m.create(CashApprovalRule, {
        companyId: ctx.companyId,
        name: dto.name,
        description: dto.description ?? null,
        scope: dto.scope ?? CashApprovalScope.OUT,
        minAmount: round2(dto.minAmount ?? 0),
        maxAmount: dto.maxAmount != null ? round2(dto.maxAmount) : null,
        currency: (dto.currency || 'USD').toUpperCase(),
        categoryIds: dto.categoryIds?.length ? dto.categoryIds : null,
        accountIds: dto.accountIds?.length ? dto.accountIds : null,
        levels: this.cleanLevels(dto.levels),
        applyToManagers: dto.applyToManagers ?? true,
        allowSelfApproval: dto.allowSelfApproval ?? false,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
        createdById: user.id,
      }),
    );
    return { message: this.t('cash_flow.approval.rule_created', lang), data: await this.serializeRule(rule) };
  }

  async updateRule(id: string, dto: UpdateCashApprovalRuleDto, user: UserEntity, lang = 'fr') {
    const rule = await this.m.findOne(CashApprovalRule, { where: { id } });
    if (!rule) throw new NotFoundException(this.t('cash_flow.approval.rule_not_found', lang));
    await this.access.context(user, rule.companyId, lang, FinanceRole.MANAGER);
    await this.validateRule(rule.companyId, { minAmount: dto.minAmount ?? rule.minAmount, maxAmount: dto.maxAmount === undefined ? rule.maxAmount : dto.maxAmount, ...dto } as any, lang);
    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.description !== undefined) rule.description = dto.description || null;
    if (dto.scope !== undefined) rule.scope = dto.scope;
    if (dto.minAmount !== undefined) rule.minAmount = round2(dto.minAmount);
    if (dto.maxAmount !== undefined) rule.maxAmount = dto.maxAmount != null ? round2(dto.maxAmount) : null;
    if (dto.currency !== undefined) rule.currency = dto.currency.toUpperCase();
    if (dto.categoryIds !== undefined) rule.categoryIds = dto.categoryIds?.length ? dto.categoryIds : null;
    if (dto.accountIds !== undefined) rule.accountIds = dto.accountIds?.length ? dto.accountIds : null;
    if (dto.levels !== undefined) rule.levels = this.cleanLevels(dto.levels);
    if (dto.applyToManagers !== undefined) rule.applyToManagers = dto.applyToManagers;
    if (dto.allowSelfApproval !== undefined) rule.allowSelfApproval = dto.allowSelfApproval;
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    const saved = await this.m.save(CashApprovalRule, rule);
    // Les demandes déjà en cours gardent leur circuit (copie faite à la demande)
    return { message: this.t('cash_flow.approval.rule_updated', lang), data: await this.serializeRule(saved) };
  }

  async deleteRule(id: string, user: UserEntity, lang = 'fr') {
    const rule = await this.m.findOne(CashApprovalRule, { where: { id } });
    if (!rule) throw new NotFoundException(this.t('cash_flow.approval.rule_not_found', lang));
    await this.access.context(user, rule.companyId, lang, FinanceRole.MANAGER);
    await this.m.delete(CashApprovalRule, { id });
    return { message: this.t('cash_flow.approval.rule_deleted', lang), data: { id } };
  }

  /** Modèles prêts à l'emploi */
  templates(lang = 'fr') {
    return {
      message: this.t('cash_flow.approval.templates', lang),
      data: Object.entries(RULE_TEMPLATES).map(([key, t]) => ({ key, ...t })),
    };
  }

  async applyTemplates(user: UserEntity, companyId: string | undefined, keys: string[] | undefined, lang = 'fr') {
    const ctx = await this.access.context(user, companyId, lang, FinanceRole.MANAGER);
    const chosen = (keys?.length ? keys : Object.keys(RULE_TEMPLATES)).filter((k) => RULE_TEMPLATES[k]);
    const created: any[] = [];
    for (const k of chosen) {
      const exists = await this.m.count(CashApprovalRule, { where: { companyId: ctx.companyId, name: RULE_TEMPLATES[k].name } });
      if (exists) continue;
      created.push((await this.createRule({ ...RULE_TEMPLATES[k], companyId: ctx.companyId } as CreateCashApprovalRuleDto, user, lang)).data);
    }
    return { message: this.t('cash_flow.approval.templates_applied', lang, { count: created.length }), data: created };
  }

  /** ✅ Tester une opération : règle appliquée et validateurs de chaque niveau */
  async simulate(dto: SimulateCashApprovalDto, user: UserEntity, lang = 'fr') {
    const ctx = await this.access.context(user, dto.companyId, lang);
    const scope = dto.scope === CashApprovalScope.ALL ? CashApprovalScope.OUT : dto.scope;
    const plan = await this.plan(ctx, { scope: scope as any, amount: dto.amount, currency: dto.currency, categoryId: dto.categoryId, accountIds: dto.accountId ? [dto.accountId] : [] }, user);
    if (!plan) return { message: this.t('cash_flow.approval.simulate_none', lang), data: { required: false, levels: [] } };
    const p = await this.people(plan.levels.flatMap((l) => l.approverIds));
    return {
      message: this.t('cash_flow.approval.simulate_ok', lang, { count: plan.levels.filter((l) => l.status === CashApprovalLevelStatus.WAITING).length }),
      data: {
        required: true,
        ruleId: plan.ruleId,
        ruleName: plan.ruleName,
        amountUsd: plan.amountUsd,
        levels: plan.levels.map((l) => ({
          level: l.level,
          name: l.name,
          status: l.status === CashApprovalLevelStatus.SKIPPED ? 'SKIPPED' : 'REQUIRED',
          minApprovals: l.minApprovals,
          call: l.call,
          approvers: l.approverIds.map((id) => p.get(id) ?? { id }),
        })),
      },
    };
  }
}
