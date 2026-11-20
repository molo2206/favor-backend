import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { NeedsAccessService } from './common/needs-access.service';
import { NeedMemberRole, NEED_CATEGORIES } from './common/needs.enums';
import { NeedLevelConfig, NeedMember, NeedRule } from './entities/need-config.entity';
import { NeedsWorkflowService } from './needs-workflow.service';
import { CreateNeedRuleDto, NeedAvailabilityDto, SimulateNeedCircuitDto, UpdateNeedRuleDto, UpsertNeedMemberDto } from './dto/needs.dto';

/** Modèles de circuits prêts à l'emploi */
const TEMPLATES: Record<string, Omit<CreateNeedRuleDto, 'companyId'>> = {
  standard: {
    name: 'Circuit standard (4 niveaux)',
    description: 'Chef de service → Chargé de programme → RAF → Direction générale',
    levels: [
      { name: 'Chef de service', approverRoles: ['DEPARTMENT_MANAGER'], call: true },
      { name: 'Chargé de programme', approverRoles: ['PARENT_DEPARTMENT_MANAGER'], call: true },
      { name: 'Responsable administratif et financier', approverRoles: ['FINANCE'], call: true },
      { name: 'Direction générale', approverRoles: ['OWNER'], call: true },
    ],
    priority: 0,
  },
  small: {
    name: 'Petites dépenses (< 500 USD)',
    description: 'Chef de service → RAF',
    maxAmount: 500,
    currency: 'USD',
    levels: [
      { name: 'Chef de service', approverRoles: ['DEPARTMENT_MANAGER'], call: true },
      { name: 'Responsable administratif et financier', approverRoles: ['FINANCE'], call: false },
    ],
    priority: 10,
  },
  large: {
    name: 'Grosses dépenses (≥ 5 000 USD)',
    description: 'Validation supplémentaire de la direction au-delà de 5 000 USD',
    minAmount: 5000,
    currency: 'USD',
    levels: [
      { name: 'Chef de service', approverRoles: ['DEPARTMENT_MANAGER'], call: true },
      { name: 'Responsable administratif et financier', approverRoles: ['FINANCE'], call: true },
      { name: 'Direction générale', approverRoles: ['OWNER'], call: true },
      { name: 'Conseil / Direction (≥ 20 000 USD)', approverRoles: ['OWNER'], minApprovals: 2, minAmount: 20000, call: true },
    ],
    priority: 20,
  },
};

/**
 * ✅ Paramètres du module (administrateur) : circuits (niveaux, ordre, validateurs, départements,
 * seuils, délais et relances), rôles (ADMIN / FINANCE / VIEWER), indisponibilités et remplaçants.
 */
@Injectable()
export class NeedsConfigService {
  constructor(
    private readonly access: NeedsAccessService,
    private readonly workflow: NeedsWorkflowService,
  ) { }

  private get m() {
    return this.access.m;
  }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.access.t(key, lang, params);
  }

  private async checkUsers(companyId: string, ids: string[], lang: string) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return;
    const rows: any[] = await this.m.query(
      `SELECT DISTINCT userId FROM user_has_company WHERE companyId = ? AND userId IN (${unique.map(() => '?').join(',')})`,
      [companyId, ...unique],
    );
    const found = new Set(rows.map((r) => r.userId));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length) throw new BadRequestException(this.t('needs.users_not_in_company', lang, { ids: missing.join(', ') }));
  }

  private levelsOf(levels: any[]): NeedLevelConfig[] {
    return levels.map((l) => ({
      name: l.name,
      approverIds: l.approverIds ?? [],
      approverRoles: (l.approverRoles ?? []).map((r: string) => r.toUpperCase()),
      substituteIds: l.substituteIds ?? [],
      minApprovals: l.minApprovals ?? 1,
      minAmount: l.minAmount ?? null,
      call: l.call !== false,
      reminderMinutes: l.reminderMinutes,
      maxReminders: l.maxReminders,
      escalateToIds: l.escalateToIds ?? [],
    }));
  }

  private async validateLevels(companyId: string, levels: any[], lang: string) {
    for (const [i, l] of levels.entries()) {
      if (!(l.approverIds?.length || l.approverRoles?.length)) throw new BadRequestException(this.t('needs.level_needs_approver', lang, { level: i + 1 }));
    }
    await this.checkUsers(companyId, levels.flatMap((l) => [...(l.approverIds ?? []), ...(l.substituteIds ?? []), ...(l.escalateToIds ?? [])]), lang);
  }

  private async view(rules: NeedRule[]) {
    const ids = rules.flatMap((r) => r.levels.flatMap((l) => [...(l.approverIds ?? []), ...(l.substituteIds ?? []), ...(l.escalateToIds ?? [])]));
    const people = await this.access.people(ids);
    const deptIds = [...new Set(rules.flatMap((r) => r.departmentIds ?? []))];
    const depts: any[] = deptIds.length ? await this.m.query(`SELECT id, name FROM hr_departments WHERE id IN (${deptIds.map(() => '?').join(',')})`, deptIds) : [];
    const dmap = new Map(depts.map((d) => [d.id, d.name]));
    return rules.map((r) => ({
      ...r,
      departments: (r.departmentIds ?? []).map((id) => ({ id, name: dmap.get(id) ?? null })),
      levels: r.levels.map((l, i) => ({
        ...l,
        level: i + 1,
        approvers: (l.approverIds ?? []).map((id) => people.get(id) ?? { id }),
        substitutes: (l.substituteIds ?? []).map((id) => people.get(id) ?? { id }),
        escalateTo: (l.escalateToIds ?? []).map((id) => people.get(id) ?? { id }),
      })),
    }));
  }

  // ---------- Règles (circuits) ----------
  async listRules(user: UserEntity, companyId: string | undefined, lang: string) {
    const ctx = await this.access.context(user, companyId, lang);
    if (!this.access.seesAll(ctx)) throw new ForbiddenException(this.t('needs.admin_only', lang));
    const rules = await this.m.find(NeedRule, { where: { companyId: ctx.companyId }, order: { priority: 'DESC', minAmount: 'DESC', createdAt: 'ASC' } });
    return {
      message: this.t('needs.rules', lang),
      data: {
        rules: await this.view(rules),
        templates: Object.entries(TEMPLATES).map(([key, t]) => ({ key, ...t })),
        approverRoles: ['DEPARTMENT_MANAGER', 'PARENT_DEPARTMENT_MANAGER', 'FINANCE', 'OWNER', 'NEED_ADMIN'],
        categories: NEED_CATEGORIES,
      },
    };
  }

  async createRule(dto: CreateNeedRuleDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang);
    this.access.assertAdmin(ctx, lang);
    await this.validateLevels(ctx.companyId, dto.levels, lang);
    if (dto.maxAmount != null && dto.maxAmount <= (dto.minAmount ?? 0)) throw new BadRequestException(this.t('needs.rule_amounts', lang));
    const rule = await this.m.save(
      NeedRule,
      this.m.create(NeedRule, {
        companyId: ctx.companyId,
        name: dto.name,
        description: dto.description ?? null,
        departmentIds: dto.departmentIds?.length ? dto.departmentIds : null,
        categories: dto.categories?.length ? dto.categories.map((c) => c.toUpperCase()) : null,
        priorities: dto.priorities?.length ? dto.priorities : null,
        minAmount: dto.minAmount ?? 0,
        maxAmount: dto.maxAmount ?? null,
        currency: (dto.currency || 'USD').toUpperCase(),
        levels: this.levelsOf(dto.levels),
        allowSelfApproval: !!dto.allowSelfApproval,
        slaHours: dto.slaHours ?? null,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
        createdById: user.id,
      }),
    );
    return { message: this.t('needs.rule_saved', lang), data: (await this.view([rule]))[0] };
  }

  /** Crée une règle à partir d'un modèle (standard, small, large) */
  async createFromTemplate(key: string, companyId: string | undefined, user: UserEntity, lang: string) {
    const tpl = TEMPLATES[key];
    if (!tpl) throw new NotFoundException(this.t('needs.template_not_found', lang));
    return this.createRule({ ...tpl, companyId } as CreateNeedRuleDto, user, lang);
  }

  async updateRule(id: string, dto: UpdateNeedRuleDto, user: UserEntity, lang: string) {
    const rule = await this.m.findOne(NeedRule, { where: { id } });
    if (!rule) throw new NotFoundException(this.t('needs.rule_not_found', lang));
    const ctx = await this.access.context(user, rule.companyId, lang);
    this.access.assertAdmin(ctx, lang);
    if (dto.levels) await this.validateLevels(ctx.companyId, dto.levels, lang);
    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.description !== undefined) rule.description = dto.description || null;
    if (dto.departmentIds !== undefined) rule.departmentIds = dto.departmentIds.length ? dto.departmentIds : null;
    if (dto.categories !== undefined) rule.categories = dto.categories.length ? dto.categories.map((c) => c.toUpperCase()) : null;
    if (dto.priorities !== undefined) rule.priorities = dto.priorities.length ? dto.priorities : null;
    if (dto.minAmount !== undefined) rule.minAmount = dto.minAmount;
    if (dto.maxAmount !== undefined) rule.maxAmount = dto.maxAmount;
    if (dto.currency !== undefined) rule.currency = dto.currency.toUpperCase();
    if (dto.levels) rule.levels = this.levelsOf(dto.levels);
    if (dto.allowSelfApproval !== undefined) rule.allowSelfApproval = dto.allowSelfApproval;
    if (dto.slaHours !== undefined) rule.slaHours = dto.slaHours;
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    if (rule.maxAmount != null && Number(rule.maxAmount) <= Number(rule.minAmount)) throw new BadRequestException(this.t('needs.rule_amounts', lang));
    const saved = await this.m.save(NeedRule, rule);
    // Les demandes déjà soumises gardent leur circuit (copié à la soumission)
    return { message: this.t('needs.rule_saved', lang), data: (await this.view([saved]))[0] };
  }

  async deleteRule(id: string, user: UserEntity, lang: string) {
    const rule = await this.m.findOne(NeedRule, { where: { id } });
    if (!rule) throw new NotFoundException(this.t('needs.rule_not_found', lang));
    const ctx = await this.access.context(user, rule.companyId, lang);
    this.access.assertAdmin(ctx, lang);
    await this.m.delete(NeedRule, { id });
    return { message: this.t('needs.rule_deleted', lang), data: { id } };
  }

  /** Quel circuit pour cette demande ? (aperçu avant soumission) */
  async simulate(dto: SimulateNeedCircuitDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang);
    const requesterId = dto.requesterId && this.access.seesAll(ctx) ? dto.requesterId : user.id;
    const dept = dto.departmentId ? await this.access.department(dto.departmentId) : await this.access.departmentOf(requesterId, ctx.companyId);
    const plan = await this.workflow.plan({
      companyId: ctx.companyId,
      requesterId,
      departmentId: dept?.id ?? null,
      category: dto.category ?? null,
      priority: dto.priority ?? null,
      amount: dto.amount,
      currency: (dto.currency || 'USD').toUpperCase(),
    });
    const people = await this.access.people(plan.levels.flatMap((l) => [...l.approverIds, ...l.substituteIds]));
    return {
      message: this.t('needs.simulation', lang),
      data: {
        rule: plan.rule ? { id: plan.rule.id, name: plan.rule.name } : null,
        department: dept ? { id: dept.id, name: dept.name } : null,
        amountUsd: plan.amountUsd,
        levels: plan.levels.map((l) => ({
          level: l.level,
          name: l.name,
          status: l.status,
          skipReason: l.skipReason ?? null,
          minApprovals: l.minApprovals,
          call: l.call,
          approvers: l.approverIds.map((id) => people.get(id) ?? { id }),
          substitutes: l.substituteIds.map((id) => people.get(id) ?? { id }),
        })),
      },
    };
  }

  // ---------- Rôles du module ----------
  async listMembers(user: UserEntity, companyId: string | undefined, lang: string) {
    const ctx = await this.access.context(user, companyId, lang);
    this.access.assertAdmin(ctx, lang);
    const rows = await this.m.find(NeedMember, { where: { companyId: ctx.companyId }, order: { createdAt: 'ASC' } });
    const people = await this.access.people(rows.flatMap((r) => [r.userId, r.delegateId]));
    return {
      message: this.t('needs.members', lang),
      data: rows.map((r) => ({
        ...r,
        user: people.get(r.userId) ?? { id: r.userId },
        delegate: r.delegateId ? people.get(r.delegateId) ?? { id: r.delegateId } : null,
        unavailableNow: !!(r.unavailableUntil && new Date(r.unavailableUntil) >= new Date() && (!r.unavailableFrom || new Date(r.unavailableFrom) <= new Date())),
      })),
    };
  }

  async upsertMember(dto: UpsertNeedMemberDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang);
    this.access.assertAdmin(ctx, lang);
    await this.checkUsers(ctx.companyId, [dto.userId], lang);
    let row = await this.m.findOne(NeedMember, { where: { companyId: ctx.companyId, userId: dto.userId } });
    if (!row) row = this.m.create(NeedMember, { companyId: ctx.companyId, userId: dto.userId, createdById: user.id });
    row.role = (dto.role as NeedMemberRole) ?? null;
    const saved = await this.m.save(NeedMember, row);
    return { message: this.t('needs.member_saved', lang), data: saved };
  }

  async removeMember(userId: string, companyId: string | undefined, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, companyId, lang);
    this.access.assertAdmin(ctx, lang);
    await this.m.delete(NeedMember, { companyId: ctx.companyId, userId });
    return { message: this.t('needs.member_removed', lang), data: { userId } };
  }

  /** ✅ Indisponibilité (congé, mission) + remplaçant : soi-même, ou un administrateur pour un autre */
  async setAvailability(dto: NeedAvailabilityDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang);
    const target = dto.userId ?? user.id;
    if (target !== user.id) this.access.assertAdmin(ctx, lang);
    if (dto.delegateId) {
      if (dto.delegateId === target) throw new BadRequestException(this.t('needs.delegate_self', lang));
      await this.checkUsers(ctx.companyId, [dto.delegateId], lang);
    }
    if (dto.from && dto.until && dto.until < dto.from) throw new BadRequestException(this.t('needs.dates_order', lang));
    let row = await this.m.findOne(NeedMember, { where: { companyId: ctx.companyId, userId: target } });
    if (!row) row = this.m.create(NeedMember, { companyId: ctx.companyId, userId: target, role: null, createdById: user.id });
    row.unavailableFrom = dto.from ? new Date(`${dto.from}T00:00:00`) : null;
    row.unavailableUntil = dto.until ? new Date(`${dto.until}T23:59:59`) : null;
    row.delegateId = dto.until ? dto.delegateId ?? null : null;
    const saved = await this.m.save(NeedMember, row);

    // Demandes déjà à son niveau : le remplaçant est prévenu tout de suite
    if (saved.unavailableUntil && saved.delegateId) {
      const pending: any[] = await this.m.query(
        "SELECT id FROM bo_need_requests WHERE companyId = ? AND status = 'PENDING' AND JSON_SEARCH(levels, 'one', ?) IS NOT NULL",
        [ctx.companyId, target],
      );
      for (const p of pending) void this.workflow.announce(p.id, lang);
    }
    return { message: this.t('needs.availability_saved', lang), data: saved };
  }

  /** Utilisateurs de l'entreprise (pour choisir les validateurs) */
  async companyUsers(user: UserEntity, companyId: string | undefined, search: string | undefined, lang: string) {
    const ctx = await this.access.context(user, companyId, lang);
    const params: any[] = [ctx.companyId];
    let s = '';
    if (search?.trim()) {
      s = ' AND (u.fullName LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)';
      const v = `%${search.trim()}%`;
      params.push(v, v, v);
    }
    const rows: any[] = await this.m.query(
      `SELECT DISTINCT u.id, u.fullName, u.phone, u.email, u.image, uhc.isOwner
         FROM user_has_company uhc JOIN users u ON u.id = uhc.userId
        WHERE uhc.companyId = ?${s} ORDER BY u.fullName LIMIT 100`,
      params,
    );
    const roles = rows.length ? await this.m.find(NeedMember, { where: { companyId: ctx.companyId, userId: In(rows.map((r) => r.id)) } }) : [];
    const rmap = new Map(roles.map((r) => [r.userId, r.role]));
    return { message: this.t('needs.users', lang), data: rows.map((r) => ({ ...r, isOwner: !!r.isOwner, needRole: r.isOwner ? 'ADMIN' : rmap.get(r.id) ?? null })) };
  }
}
