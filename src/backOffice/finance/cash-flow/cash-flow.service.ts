import { BadRequestException, ConflictException, ForbiddenException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Brackets, EntityManager, In, SelectQueryBuilder } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { isCompanyOwner, pageParams, reference } from 'src/backOffice/logistics/common/logistics-access';
import { LogisticsImageService } from 'src/backOffice/logistics/common/logistics-image.service';
import {
  CashAccountType,
  CashActivity,
  CashApprovalScope,
  CashApprovalStatus,
  CashApprovalTarget,
  CashDirection,
  CashTransactionStatus,
  FinanceRole,
  SYSTEM_CATEGORY,
} from './common/cash-flow.enums';
import { CashApprovalPlan, CashApprovalService } from './cash-approval.service';
import { CashFlowAccessService, FinanceContext, RateCache, dateStr, round2, today } from './common/cash-flow-access.service';
import { CashAccount } from './entities/cash-account.entity';
import { CashCategory } from './entities/cash-category.entity';
import { CashTransaction } from './entities/cash-transaction.entity';
import { CashTransfer } from './entities/cash-transfer.entity';
import { CashForecast } from './entities/cash-forecast.entity';
import { CashClosing } from './entities/cash-closing.entity';
import { FinanceMember } from './entities/finance-member.entity';
import {
  AddFinanceMemberDto,
  BulkValidateDto,
  CancelCashTransactionDto,
  CashAccountQueryDto,
  CashCategoryQueryDto,
  CashClosingQueryDto,
  CashTransactionQueryDto,
  CopyForecastsDto,
  CreateCashAccountDto,
  CreateCashCategoryDto,
  CreateCashClosingDto,
  CreateCashTransactionDto,
  CreateCashTransferDto,
  ForecastQueryDto,
  RejectCashTransactionDto,
  UpdateCashAccountDto,
  UpdateCashCategoryDto,
  UpdateCashTransactionDto,
  UpdateFinanceMemberDto,
  UpsertForecastsDto,
} from './dto/cash-flow.dto';

type File = Express.Multer.File | undefined;

/** Rubriques créées automatiquement pour une nouvelle entreprise */
const DEFAULT_CATEGORIES: { name: string; direction: CashDirection; activity: CashActivity; code?: string; isSystem?: boolean }[] = [
  // Entrées
  { name: 'Ventes et encaissements clients', direction: CashDirection.IN, activity: CashActivity.OPERATING, code: 'IN_SALES' },
  { name: 'Prestations de services', direction: CashDirection.IN, activity: CashActivity.OPERATING, code: 'IN_SERVICES' },
  { name: 'Frais de livraison / colis', direction: CashDirection.IN, activity: CashActivity.OPERATING, code: 'IN_SHIPPING' },
  { name: 'Courses taxi', direction: CashDirection.IN, activity: CashActivity.OPERATING, code: 'IN_RIDES' },
  { name: 'Autres entrées', direction: CashDirection.IN, activity: CashActivity.OPERATING, code: 'IN_OTHER' },
  { name: 'Vente de biens / équipements', direction: CashDirection.IN, activity: CashActivity.INVESTING, code: 'IN_ASSET_SALE' },
  { name: "Apports des associés", direction: CashDirection.IN, activity: CashActivity.FINANCING, code: 'IN_CAPITAL' },
  { name: 'Emprunts reçus', direction: CashDirection.IN, activity: CashActivity.FINANCING, code: 'IN_LOAN' },
  // Sorties
  { name: 'Achats / fournisseurs', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: 'OUT_SUPPLIERS' },
  { name: 'Salaires et primes', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: 'OUT_SALARIES' },
  { name: 'Loyer', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: 'OUT_RENT' },
  { name: 'Carburant', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: 'OUT_FUEL' },
  { name: 'Transport et déplacements', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: 'OUT_TRAVEL' },
  { name: 'Électricité, eau, internet, téléphone', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: 'OUT_UTILITIES' },
  { name: 'Entretien et réparations', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: 'OUT_MAINTENANCE' },
  { name: 'Impôts et taxes', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: 'OUT_TAXES' },
  { name: 'Marketing et publicité', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: 'OUT_MARKETING' },
  { name: 'Frais bancaires', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: 'OUT_BANK_FEES' },
  { name: 'Autres sorties', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: 'OUT_OTHER' },
  { name: 'Équipements, véhicules, matériel', direction: CashDirection.OUT, activity: CashActivity.INVESTING, code: 'OUT_CAPEX' },
  { name: "Remboursement d'emprunts", direction: CashDirection.OUT, activity: CashActivity.FINANCING, code: 'OUT_LOAN_REPAY' },
  { name: 'Dividendes / retraits des associés', direction: CashDirection.OUT, activity: CashActivity.FINANCING, code: 'OUT_DIVIDENDS' },
  // Système
  { name: 'Écart de caisse (excédent)', direction: CashDirection.IN, activity: CashActivity.OPERATING, code: SYSTEM_CATEGORY.CASH_GAIN, isSystem: true },
  { name: 'Écart de caisse (manquant)', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: SYSTEM_CATEGORY.CASH_LOSS, isSystem: true },
  { name: 'Frais de transfert', direction: CashDirection.OUT, activity: CashActivity.OPERATING, code: SYSTEM_CATEGORY.TRANSFER_FEES, isSystem: true },
];

/**
 * ✅ Trésorerie (cash flow) du BackOffice :
 *  - comptes (caisses, banques, Mobile Money, F-Pay) avec solde calculé ;
 *  - rubriques d'entrées / sorties (exploitation, investissement, financement) ;
 *  - mouvements avec justificatif, validation (caissier → responsable), annulation ;
 *  - transferts entre comptes (même devise ou change), frais ;
 *  - prévisions mensuelles par rubrique ;
 *  - arrêtés de caisse (comptage, billetage, écart, verrouillage) ;
 *  - équipe finance (MANAGER, CASHIER, VIEWER).
 */
@Injectable()
export class CashFlowService {
  private readonly logger = new Logger(CashFlowService.name);

  constructor(
    private readonly access: CashFlowAccessService,
    private readonly images: LogisticsImageService,
    // ✅ Circuit de validation à plusieurs niveaux
    @Inject(forwardRef(() => CashApprovalService)) private readonly approvals: CashApprovalService,
  ) { }

  private get m() {
    return this.access.m;
  }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.access.t(key, lang, params);
  }

  private person(u?: UserEntity | null) {
    return u ? { id: u.id, fullName: u.fullName ?? null, phone: u.phone ?? null, image: u.image ?? null } : null;
  }

  // ============================================================
  // MON ACCÈS
  // ============================================================

  async me(user: UserEntity, companyId: string | undefined, lang: string) {
    const ctx = await this.access.context(user, companyId, lang);
    return {
      message: this.t('cash_flow.access', lang),
      data: {
        companyId: ctx.companyId,
        role: ctx.role,
        accountIds: ctx.accountIds,
        approvalThresholdUsd: this.access.approvalThresholdUsd,
        // ✅ Demandes que j'ai à valider (badge du menu)
        approvalsToValidate: (await this.approvals.inbox(user, ctx.companyId, lang).catch(() => ({ data: [] as any[] }))).data.length,
        can: {
          read: true,
          write: ctx.role !== FinanceRole.VIEWER,
          validate: ctx.role === FinanceRole.MANAGER,
          manage: ctx.role === FinanceRole.MANAGER,
        },
      },
    };
  }

  // ============================================================
  // ÉQUIPE FINANCE (propriétaire / admin)
  // ============================================================

  private async assertOwner(ctx: FinanceContext, lang: string) {
    if (!(await isCompanyOwner(this.access.dataSource, ctx.user, ctx.companyId))) {
      throw new ForbiddenException(this.t('cash_flow.owner_only', lang));
    }
  }

  async listMembers(user: UserEntity, companyId: string | undefined, lang: string) {
    const ctx = await this.access.context(user, companyId, lang, FinanceRole.MANAGER);
    const rows = await this.m.find(FinanceMember, { where: { companyId: ctx.companyId }, relations: { user: true }, order: { createdAt: 'ASC' } });
    return {
      message: this.t('cash_flow.members', lang),
      data: rows.map((r) => ({ id: r.id, userId: r.userId, user: this.person(r.user), role: r.role, accountIds: r.accountIds ?? [], createdAt: r.createdAt })),
    };
  }

  async addMember(dto: AddFinanceMemberDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang, FinanceRole.MANAGER);
    await this.assertOwner(ctx, lang);
    const linked = await this.access.dataSource.query(
      'SELECT 1 FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ? LIMIT 1',
      [dto.userId, ctx.companyId],
    );
    if (!linked?.length) throw new BadRequestException(this.t('cash_flow.member_not_in_company', lang));
    await this.assertAccountsOfCompany(ctx.companyId, dto.accountIds, lang);
    let row = await this.m.findOne(FinanceMember, { where: { companyId: ctx.companyId, userId: dto.userId } });
    if (row) {
      row.role = dto.role;
      row.accountIds = dto.accountIds?.length ? dto.accountIds : null;
    } else {
      row = this.m.create(FinanceMember, {
        companyId: ctx.companyId,
        userId: dto.userId,
        role: dto.role,
        accountIds: dto.accountIds?.length ? dto.accountIds : null,
        createdById: user.id,
      });
    }
    const saved = await this.m.save(FinanceMember, row);
    return { message: this.t('cash_flow.member_saved', lang), data: saved };
  }

  async updateMember(id: string, dto: UpdateFinanceMemberDto, user: UserEntity, lang: string) {
    const row = await this.m.findOne(FinanceMember, { where: { id } });
    if (!row) throw new NotFoundException(this.t('cash_flow.member_not_found', lang));
    const ctx = await this.access.context(user, row.companyId, lang, FinanceRole.MANAGER);
    await this.assertOwner(ctx, lang);
    if (dto.role) row.role = dto.role;
    if (dto.accountIds !== undefined) {
      await this.assertAccountsOfCompany(ctx.companyId, dto.accountIds, lang);
      row.accountIds = dto.accountIds?.length ? dto.accountIds : null;
    }
    return { message: this.t('cash_flow.member_saved', lang), data: await this.m.save(FinanceMember, row) };
  }

  async removeMember(id: string, user: UserEntity, lang: string) {
    const row = await this.m.findOne(FinanceMember, { where: { id } });
    if (!row) throw new NotFoundException(this.t('cash_flow.member_not_found', lang));
    const ctx = await this.access.context(user, row.companyId, lang, FinanceRole.MANAGER);
    await this.assertOwner(ctx, lang);
    await this.m.delete(FinanceMember, { id });
    return { message: this.t('cash_flow.member_removed', lang), data: { id } };
  }

  private async assertAccountsOfCompany(companyId: string, ids: string[] | undefined | null, lang: string) {
    if (!ids?.length) return;
    const n = await this.m.count(CashAccount, { where: { companyId, id: In(ids) } });
    if (n !== new Set(ids).size) throw new BadRequestException(this.t('cash_flow.account_not_found', lang));
  }

  // ============================================================
  // COMPTES
  // ============================================================

  private async accountOrFail(id: string, lang: string, m: EntityManager = this.m, lock = false): Promise<CashAccount> {
    const acc = await m.findOne(CashAccount, { where: { id }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!acc) throw new NotFoundException(this.t('cash_flow.account_not_found', lang));
    return acc;
  }

  private async checkBranch(companyId: string, branchId: string | undefined | null, lang: string) {
    if (!branchId) return;
    const b = await this.m.findOne(BranchEntity, { where: { id: branchId } });
    if (!b) throw new BadRequestException(this.t('cash_flow.branch_not_found', lang));
    const owner = (b as any).company_id ?? (b as any).companyId ?? null;
    if (owner && owner !== companyId) throw new BadRequestException(this.t('cash_flow.branch_not_found', lang));
  }

  private async withBalances(companyId: string, accounts: CashAccount[], target = 'USD') {
    if (!accounts.length) return [];
    const balances = await this.access.balances(companyId, { accountIds: accounts.map((a) => a.id) });
    const pending: { accountId: string; direction: string; total: string; n: string }[] = await this.m.query(
      `SELECT accountId, direction, SUM(amount) AS total, COUNT(*) AS n FROM bo_cash_transactions
        WHERE companyId = ? AND status = 'PENDING' AND accountId IN (${accounts.map(() => '?').join(',')})
        GROUP BY accountId, direction`,
      [companyId, ...accounts.map((a) => a.id)],
    );
    const rates = new RateCache(this.m);
    const out: any[] = [];
    for (const a of accounts) {
      const balance = balances.get(a.id) ?? Number(a.openingBalance || 0);
      const pIn = pending.find((p) => p.accountId === a.id && p.direction === 'IN');
      const pOut = pending.find((p) => p.accountId === a.id && p.direction === 'OUT');
      out.push({
        ...a,
        branch: a.branch ? { id: a.branch.id, name: (a.branch as any).name ?? null } : null,
        balance,
        balanceConverted: await rates.convert(balance, a.currency, target),
        convertedCurrency: target,
        pendingIn: round2(Number(pIn?.total || 0)),
        pendingOut: round2(Number(pOut?.total || 0)),
        pendingCount: Number(pIn?.n || 0) + Number(pOut?.n || 0),
        lockedUntil: await this.access.lockDate(a.id),
        lowBalance: a.minBalance != null && balance < Number(a.minBalance),
      });
    }
    return out;
  }

  async listAccounts(query: CashAccountQueryDto, user: UserEntity, lang: string, target?: string) {
    const ctx = await this.access.context(user, query.companyId, lang);
    const qb = this.m.createQueryBuilder(CashAccount, 'a').leftJoinAndSelect('a.branch', 'branch').where('a.companyId = :c', { c: ctx.companyId });
    const active = query.active ?? 'true';
    if (active !== 'all') qb.andWhere('a.isActive = :act', { act: active === 'true' ? 1 : 0 });
    if (query.type) qb.andWhere('a.type = :type', { type: query.type });
    if (query.currency) qb.andWhere('a.currency = :cur', { cur: query.currency });
    if (query.branchId) qb.andWhere('a.branchId = :b', { b: query.branchId });
    if (ctx.accountIds) qb.andWhere('a.id IN (:...ids)', { ids: ctx.accountIds });
    const rows = await qb.orderBy('a.isDefault', 'DESC').addOrderBy('a.name', 'ASC').getMany();
    const data = await this.withBalances(ctx.companyId, rows, (target || 'USD').toUpperCase());
    // Totaux par devise
    const totals: Record<string, number> = {};
    for (const a of data) if (a.isActive) totals[a.currency] = round2((totals[a.currency] ?? 0) + a.balance);
    return { message: this.t('cash_flow.accounts', lang), data, meta: { totalsByCurrency: totals } };
  }

  async findAccount(id: string, user: UserEntity, lang: string) {
    const acc = await this.m.findOne(CashAccount, { where: { id }, relations: { branch: true } });
    if (!acc) throw new NotFoundException(this.t('cash_flow.account_not_found', lang));
    const ctx = await this.access.context(user, acc.companyId, lang);
    this.access.assertAccountAllowed(ctx, acc.id, lang);
    const [data] = await this.withBalances(ctx.companyId, [acc]);
    const last = await this.m.find(CashTransaction, {
      where: { accountId: id },
      relations: { category: true, createdBy: true },
      order: { transactionDate: 'DESC', createdAt: 'DESC' },
      take: 10,
    });
    return { message: this.t('cash_flow.account', lang), data: { ...data, lastTransactions: last.map((t) => this.serializeTx(t)) } };
  }

  async createAccount(dto: CreateCashAccountDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang, FinanceRole.MANAGER);
    await this.checkBranch(ctx.companyId, dto.branchId, lang);
    const dup = await this.m.count(CashAccount, { where: { companyId: ctx.companyId, name: dto.name } });
    if (dup) throw new ConflictException(this.t('cash_flow.account_exists', lang));
    const first = !(await this.m.count(CashAccount, { where: { companyId: ctx.companyId } }));
    if (dto.isDefault) await this.m.update(CashAccount, { companyId: ctx.companyId }, { isDefault: false });
    const saved = await this.m.save(
      CashAccount,
      this.m.create(CashAccount, {
        companyId: ctx.companyId,
        branchId: dto.branchId ?? null,
        name: dto.name,
        type: dto.type,
        currency: dto.currency,
        bankName: dto.bankName ?? null,
        accountNumber: dto.accountNumber ?? null,
        openingBalance: round2(dto.openingBalance ?? 0),
        openingDate: dto.openingDate ?? today(),
        // ✅ Une caisse ne descend jamais sous 0 ; découvert possible pour une banque si demandé
        allowNegative: dto.type === CashAccountType.CASH ? false : !!dto.allowNegative,
        minBalance: dto.minBalance ?? null,
        isDefault: dto.isDefault ?? first,
        isActive: true,
        color: dto.color ?? null,
        notes: dto.notes ?? null,
        createdById: user.id,
      }),
    );
    await this.ensureDefaultCategories(ctx.companyId);
    return { message: this.t('cash_flow.account_created', lang), data: (await this.withBalances(ctx.companyId, [saved]))[0] };
  }

  async updateAccount(id: string, dto: UpdateCashAccountDto, user: UserEntity, lang: string) {
    const acc = await this.accountOrFail(id, lang);
    const ctx = await this.access.context(user, acc.companyId, lang, FinanceRole.MANAGER);
    if (dto.branchId !== undefined) {
      await this.checkBranch(ctx.companyId, dto.branchId, lang);
      acc.branchId = dto.branchId || null;
    }
    if (dto.name && dto.name !== acc.name) {
      const dup = await this.m.count(CashAccount, { where: { companyId: ctx.companyId, name: dto.name } });
      if (dup) throw new ConflictException(this.t('cash_flow.account_exists', lang));
      acc.name = dto.name;
    }
    if (dto.openingBalance !== undefined || dto.openingDate !== undefined) {
      if (await this.access.lockDate(acc.id)) throw new BadRequestException(this.t('cash_flow.opening_locked', lang));
      if (dto.openingBalance !== undefined) acc.openingBalance = round2(dto.openingBalance);
      if (dto.openingDate !== undefined) acc.openingDate = dto.openingDate;
    }
    if (dto.type) acc.type = dto.type;
    if (dto.bankName !== undefined) acc.bankName = dto.bankName || null;
    if (dto.accountNumber !== undefined) acc.accountNumber = dto.accountNumber || null;
    if (dto.allowNegative !== undefined) acc.allowNegative = acc.type === CashAccountType.CASH ? false : dto.allowNegative;
    if (acc.type === CashAccountType.CASH) acc.allowNegative = false;
    if (dto.minBalance !== undefined) acc.minBalance = dto.minBalance;
    if (dto.color !== undefined) acc.color = dto.color || null;
    if (dto.notes !== undefined) acc.notes = dto.notes || null;
    if (dto.isActive !== undefined) {
      if (!dto.isActive) {
        const pending = await this.m.count(CashTransaction, { where: { accountId: acc.id, status: CashTransactionStatus.PENDING } });
        if (pending) throw new BadRequestException(this.t('cash_flow.account_has_pending', lang, { count: pending }));
      }
      acc.isActive = dto.isActive;
    }
    if (dto.isDefault) {
      await this.m.update(CashAccount, { companyId: ctx.companyId }, { isDefault: false });
      acc.isDefault = true;
    } else if (dto.isDefault === false) acc.isDefault = false;
    const saved = await this.m.save(CashAccount, acc);
    return { message: this.t('cash_flow.account_updated', lang), data: (await this.withBalances(ctx.companyId, [saved]))[0] };
  }

  // ============================================================
  // RUBRIQUES
  // ============================================================

  /** Crée les rubriques par défaut (et les rubriques système manquantes) */
  async ensureDefaultCategories(companyId: string, m: EntityManager = this.m) {
    const existing = await m.find(CashCategory, { where: { companyId }, select: { id: true, code: true } as any });
    const codes = new Set(existing.map((c) => c.code).filter(Boolean));
    const firstTime = !existing.length;
    const toCreate = DEFAULT_CATEGORIES.filter((d) => (firstTime || d.isSystem) && !codes.has(d.code));
    if (!toCreate.length) return;
    await m.save(
      CashCategory,
      toCreate.map((d, i) =>
        m.create(CashCategory, {
          companyId,
          name: d.name,
          code: d.code ?? null,
          direction: d.direction,
          activity: d.activity,
          isSystem: !!d.isSystem,
          isActive: true,
          position: (existing.length + i) * 10,
        }),
      ),
    );
  }

  async systemCategory(companyId: string, code: string, m: EntityManager = this.m): Promise<CashCategory> {
    let cat = await m.findOne(CashCategory, { where: { companyId, code } });
    if (!cat) {
      await this.ensureDefaultCategories(companyId, m);
      cat = await m.findOne(CashCategory, { where: { companyId, code } });
    }
    return cat!;
  }

  async listCategories(query: CashCategoryQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, query.companyId, lang);
    await this.ensureDefaultCategories(ctx.companyId);
    const where: any = { companyId: ctx.companyId };
    if (query.direction) where.direction = query.direction;
    if (query.activity) where.activity = query.activity;
    const active = query.active ?? 'true';
    if (active !== 'all') where.isActive = active === 'true';
    const rows = await this.m.find(CashCategory, { where, order: { direction: 'ASC', position: 'ASC', name: 'ASC' } });
    // Arbre : rubriques principales + sous-rubriques
    const roots = rows.filter((r) => !r.parentId || !rows.some((p) => p.id === r.parentId));
    const tree = roots.map((r) => ({ ...r, children: rows.filter((c) => c.parentId === r.id) }));
    return { message: this.t('cash_flow.categories', lang), data: rows, tree };
  }

  async createCategory(dto: CreateCashCategoryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang, FinanceRole.MANAGER);
    if (dto.code?.startsWith('SYS_')) throw new BadRequestException(this.t('cash_flow.category_code_reserved', lang));
    if (dto.parentId) {
      const parent = await this.m.findOne(CashCategory, { where: { id: dto.parentId, companyId: ctx.companyId } });
      if (!parent) throw new BadRequestException(this.t('cash_flow.category_not_found', lang));
      if (parent.direction !== dto.direction) throw new BadRequestException(this.t('cash_flow.category_parent_direction', lang));
    }
    const dup = await this.m.count(CashCategory, { where: { companyId: ctx.companyId, name: dto.name, direction: dto.direction } });
    if (dup) throw new ConflictException(this.t('cash_flow.category_exists', lang));
    const saved = await this.m.save(
      CashCategory,
      this.m.create(CashCategory, {
        companyId: ctx.companyId,
        parentId: dto.parentId ?? null,
        name: dto.name,
        code: dto.code ?? null,
        direction: dto.direction,
        activity: dto.activity ?? CashActivity.OPERATING,
        color: dto.color ?? null,
        position: dto.position ?? 0,
        isActive: true,
        isSystem: false,
      }),
    );
    return { message: this.t('cash_flow.category_created', lang), data: saved };
  }

  async updateCategory(id: string, dto: UpdateCashCategoryDto, user: UserEntity, lang: string) {
    const cat = await this.m.findOne(CashCategory, { where: { id } });
    if (!cat) throw new NotFoundException(this.t('cash_flow.category_not_found', lang));
    const ctx = await this.access.context(user, cat.companyId, lang, FinanceRole.MANAGER);
    if (cat.isSystem) throw new BadRequestException(this.t('cash_flow.category_system', lang));
    if (dto.parentId !== undefined) {
      if (dto.parentId) {
        if (dto.parentId === cat.id) throw new BadRequestException(this.t('cash_flow.category_parent_direction', lang));
        const parent = await this.m.findOne(CashCategory, { where: { id: dto.parentId, companyId: ctx.companyId } });
        if (!parent || parent.direction !== cat.direction) throw new BadRequestException(this.t('cash_flow.category_parent_direction', lang));
      }
      cat.parentId = dto.parentId || null;
    }
    if (dto.name) cat.name = dto.name;
    if (dto.code !== undefined) {
      if (dto.code?.startsWith('SYS_')) throw new BadRequestException(this.t('cash_flow.category_code_reserved', lang));
      cat.code = dto.code || null;
    }
    if (dto.activity) cat.activity = dto.activity;
    if (dto.color !== undefined) cat.color = dto.color || null;
    if (dto.position !== undefined) cat.position = dto.position;
    if (dto.isActive !== undefined) cat.isActive = dto.isActive;
    return { message: this.t('cash_flow.category_updated', lang), data: await this.m.save(CashCategory, cat) };
  }

  // ============================================================
  // MOUVEMENTS
  // ============================================================

  serializeTx(t: CashTransaction) {
    return {
      id: t.id,
      reference: t.reference,
      companyId: t.companyId,
      accountId: t.accountId,
      account: t.account ? { id: t.account.id, name: t.account.name, type: t.account.type, currency: t.account.currency } : undefined,
      categoryId: t.categoryId ?? null,
      category: t.category
        ? { id: t.category.id, name: t.category.name, code: t.category.code ?? null, activity: t.category.activity, color: t.category.color ?? null }
        : null,
      direction: t.direction,
      amount: Number(t.amount),
      signedAmount: t.direction === CashDirection.IN ? Number(t.amount) : -Number(t.amount),
      currency: t.currency,
      transactionDate: dateStr(t.transactionDate),
      status: t.status,
      paymentMethod: t.paymentMethod ?? null,
      counterpartyName: t.counterpartyName ?? null,
      counterpartyPhone: t.counterpartyPhone ?? null,
      description: t.description ?? null,
      documentNumber: t.documentNumber ?? null,
      attachmentUrl: t.attachmentUrl ?? null,
      branchId: t.branchId ?? null,
      transferId: t.transferId ?? null,
      closingId: t.closingId ?? null,
      sourceType: t.sourceType ?? null,
      sourceId: t.sourceId ?? null,
      createdById: t.createdById ?? null,
      createdBy: this.person(t.createdBy),
      validatedById: t.validatedById ?? null,
      validatedBy: this.person(t.validatedBy),
      validatedAt: t.validatedAt ?? null,
      rejectionReason: t.rejectionReason ?? null,
      cancelledById: t.cancelledById ?? null,
      cancelledAt: t.cancelledAt ?? null,
      cancellationReason: t.cancellationReason ?? null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  private async txOrFail(id: string, lang: string, m: EntityManager = this.m, lock = false) {
    const tx = await m.findOne(CashTransaction, {
      where: { id },
      relations: lock ? {} : { account: true, category: true, createdBy: true, validatedBy: true },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!tx) throw new NotFoundException(this.t('cash_flow.transaction_not_found', lang));
    return tx;
  }

  private async reload(id: string) {
    const t = await this.m.findOne(CashTransaction, { where: { id }, relations: { account: true, category: true, createdBy: true, validatedBy: true } });
    return t ? this.serializeTx(t) : null;
  }

  private async categoryFor(companyId: string, categoryId: string | undefined | null, direction: CashDirection, lang: string, m: EntityManager) {
    if (!categoryId) return null;
    const cat = await m.findOne(CashCategory, { where: { id: categoryId, companyId } });
    if (!cat || !cat.isActive) throw new BadRequestException(this.t('cash_flow.category_not_found', lang));
    if (cat.direction !== direction) throw new BadRequestException(this.t('cash_flow.category_direction', lang));
    return cat;
  }

  /** Sortie : le solde (validé) du compte doit rester ≥ 0 si le découvert n'est pas autorisé */
  private async assertFunds(acc: CashAccount, amount: number, lang: string, m: EntityManager) {
    if (acc.allowNegative) return;
    const balance = await this.access.balanceOf(acc.companyId, acc.id, null, m);
    if (balance - amount < -0.001) {
      throw new BadRequestException(this.t('cash_flow.insufficient_balance', lang, { balance, currency: acc.currency, amount }));
    }
  }

  async createTransaction(dto: CreateCashTransactionDto, file: File, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang, FinanceRole.CASHIER);
    this.access.assertAccountAllowed(ctx, dto.accountId, lang);
    const date = dto.transactionDate ?? today();
    if (date > today()) throw new BadRequestException(this.t('cash_flow.future_date', lang));
    await this.ensureDefaultCategories(ctx.companyId);

    const attachmentUrl = (await this.images.upload(file, 'finance/cash-flow', true)) ?? dto.attachmentUrl ?? null;
    try {
      const saved = await this.access.dataSource.transaction(async (m) => {
        const acc = await this.accountOrFail(dto.accountId, lang, m, true);
        if (acc.companyId !== ctx.companyId) throw new NotFoundException(this.t('cash_flow.account_not_found', lang));
        if (!acc.isActive) throw new BadRequestException(this.t('cash_flow.account_inactive', lang));
        await this.access.assertNotLocked(acc.id, date, lang, m);
        if (acc.openingDate && date < dateStr(acc.openingDate)!) {
          throw new BadRequestException(this.t('cash_flow.before_opening', lang, { date: dateStr(acc.openingDate) }));
        }
        const cat = await this.categoryFor(ctx.companyId, dto.categoryId, dto.direction, lang, m);
        if (cat?.isSystem) throw new BadRequestException(this.t('cash_flow.category_system', lang));
        await this.checkBranch(ctx.companyId, dto.branchId, lang);

        // ✅ Circuit de validation (règles à plusieurs niveaux, sinon seuil d'avant)
        const plan: CashApprovalPlan | null = await this.approvals.plan(
          ctx,
          {
            scope: dto.direction === CashDirection.IN ? CashApprovalScope.IN : CashApprovalScope.OUT,
            amount: dto.amount,
            currency: acc.currency,
            categoryId: cat?.id ?? null,
            accountIds: [acc.id],
          },
          user,
          m,
        );
        const pending = !!plan;
        if (!pending && dto.direction === CashDirection.OUT) await this.assertFunds(acc, dto.amount, lang, m);

        const row = await m.save(
          CashTransaction,
          m.create(CashTransaction, {
            companyId: ctx.companyId,
            reference: reference(dto.direction === CashDirection.IN ? 'ENC' : 'DEC'),
            accountId: acc.id,
            categoryId: cat?.id ?? null,
            direction: dto.direction,
            amount: round2(dto.amount),
            currency: acc.currency,
            transactionDate: date,
            status: pending ? CashTransactionStatus.PENDING : CashTransactionStatus.VALIDATED,
            paymentMethod: dto.paymentMethod ?? this.defaultMethod(acc.type),
            counterpartyName: dto.counterpartyName ?? null,
            counterpartyPhone: dto.counterpartyPhone ?? null,
            description: dto.description ?? null,
            documentNumber: dto.documentNumber ?? null,
            attachmentUrl,
            branchId: dto.branchId ?? acc.branchId ?? null,
            sourceType: dto.sourceType ?? null,
            sourceId: dto.sourceId ?? null,
            createdById: user.id,
            validatedById: pending ? null : user.id,
            validatedAt: pending ? null : new Date(),
          }),
        );
        const approval = plan
          ? await this.approvals.submit(
            m,
            plan,
            {
              type: CashApprovalTarget.TRANSACTION,
              id: row.id,
              reference: row.reference,
              direction: row.direction,
              amount: Number(row.amount),
              currency: row.currency,
              summary: [cat?.name, dto.counterpartyName, dto.description].filter(Boolean).join(' — ') || acc.name,
            },
            user,
            ctx.companyId,
          )
          : null;
        return Object.assign(row, { approvalId: approval?.id ?? null });
      });

      if (saved.status === CashTransactionStatus.PENDING) {
        // ✅ Les validateurs du 1er niveau sont appelés (sonnerie) et notifiés
        if ((saved as any).approvalId) void this.approvals.announce((saved as any).approvalId, lang, { byUserId: user.id });
      } else {
        void this.lowBalanceAlert(saved.accountId, lang);
      }
      return {
        message: this.t(saved.status === CashTransactionStatus.PENDING ? 'cash_flow.transaction_pending' : 'cash_flow.transaction_created', lang),
        data: await this.reload(saved.id),
      };
    } catch (e) {
      if (file && attachmentUrl) await this.images.remove(attachmentUrl);
      throw e;
    }
  }

  private defaultMethod(type: CashAccountType): string {
    switch (type) {
      case CashAccountType.BANK:
        return 'BANK_TRANSFER';
      case CashAccountType.MOBILE_MONEY:
        return 'MOBILE_MONEY';
      case CashAccountType.FPAY:
        return 'FPAY';
      default:
        return 'CASH';
    }
  }

  /** Alerte quand un compte passe sous son solde minimum */
  private async lowBalanceAlert(accountId: string, lang: string) {
    try {
      const acc = await this.m.findOne(CashAccount, { where: { id: accountId } });
      if (!acc || acc.minBalance == null) return;
      const balance = await this.access.balanceOf(acc.companyId, acc.id);
      if (balance >= Number(acc.minBalance)) return;
      await this.access.notify(
        await this.access.managerIds(acc.companyId),
        'low_balance',
        { account: acc.name, balance, currency: acc.currency, min: Number(acc.minBalance) },
        { accountId: acc.id, companyId: acc.companyId },
        lang,
      );
    } catch (e: any) {
      this.logger.warn(`Alerte solde bas : ${e?.message}`);
    }
  }

  /** Filtres communs (liste + export) */
  applyTxFilters(qb: SelectQueryBuilder<CashTransaction>, ctx: FinanceContext, q: CashTransactionQueryDto) {
    qb.where('t.companyId = :c', { c: ctx.companyId });
    if (ctx.accountIds) qb.andWhere('t.accountId IN (:...allowed)', { allowed: ctx.accountIds });
    if (q.accountId) qb.andWhere('t.accountId = :acc', { acc: q.accountId });
    if (q.categoryId) {
      // rubrique + ses sous-rubriques
      qb.andWhere('(t.categoryId = :cat OR t.categoryId IN (SELECT sc.id FROM bo_cash_categories sc WHERE sc.parentId = :cat))', { cat: q.categoryId });
    }
    if (q.direction) qb.andWhere('t.direction = :dir', { dir: q.direction });
    if (q.status) qb.andWhere('t.status = :st', { st: q.status });
    if (q.activity) qb.andWhere('category.activity = :activity', { activity: q.activity });
    if (q.currency) qb.andWhere('t.currency = :cur', { cur: q.currency });
    if (q.paymentMethod) qb.andWhere('t.paymentMethod = :pm', { pm: q.paymentMethod });
    if (q.branchId) qb.andWhere('t.branchId = :br', { br: q.branchId });
    if (q.createdById) qb.andWhere('t.createdById = :cb', { cb: q.createdById });
    if (q.transfers === 'true') qb.andWhere('t.transferId IS NOT NULL');
    if (q.transfers === 'false') qb.andWhere('t.transferId IS NULL');
    if (q.from) qb.andWhere('t.transactionDate >= :from', { from: q.from });
    if (q.to) qb.andWhere('t.transactionDate <= :to', { to: q.to });
    if (q.minAmount != null) qb.andWhere('t.amount >= :min', { min: q.minAmount });
    if (q.maxAmount != null) qb.andWhere('t.amount <= :max', { max: q.maxAmount });
    if (q.search) {
      const s = `%${q.search}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('t.reference LIKE :s', { s })
            .orWhere('t.description LIKE :s', { s })
            .orWhere('t.counterpartyName LIKE :s', { s })
            .orWhere('t.counterpartyPhone LIKE :s', { s })
            .orWhere('t.documentNumber LIKE :s', { s }),
        ),
      );
    }
    return qb;
  }

  async listTransactions(q: CashTransactionQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, q.companyId, lang);
    const { page, limit, skip } = pageParams(q.page, q.limit);
    const qb = this.m
      .createQueryBuilder(CashTransaction, 't')
      .leftJoinAndSelect('t.account', 'account')
      .leftJoinAndSelect('t.category', 'category')
      .leftJoinAndSelect('t.createdBy', 'createdBy')
      .leftJoinAndSelect('t.validatedBy', 'validatedBy');
    this.applyTxFilters(qb, ctx, q);

    // Totaux du filtre (mouvements validés), par devise
    const totals = await qb
      .clone()
      .select('t.currency', 'currency')
      .addSelect("SUM(CASE WHEN t.direction = 'IN' AND t.status = 'VALIDATED' THEN t.amount ELSE 0 END)", 'inflow')
      .addSelect("SUM(CASE WHEN t.direction = 'OUT' AND t.status = 'VALIDATED' THEN t.amount ELSE 0 END)", 'outflow')
      .addSelect("SUM(CASE WHEN t.status = 'PENDING' THEN 1 ELSE 0 END)", 'pending')
      .groupBy('t.currency')
      .orderBy()
      .getRawMany();

    const sortBy = q.sortBy ?? 'transactionDate';
    const [rows, total] = await qb
      .orderBy(`t.${sortBy}`, q.sortOrder ?? 'DESC')
      .addOrderBy('t.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();
    const res = new PaginatedResponseDto(rows.map((r) => this.serializeTx(r)), total, page, limit);
    return {
      message: this.t('cash_flow.transactions', lang),
      ...res,
      totals: totals.map((t: any) => ({
        currency: t.currency,
        inflow: round2(Number(t.inflow || 0)),
        outflow: round2(Number(t.outflow || 0)),
        net: round2(Number(t.inflow || 0) - Number(t.outflow || 0)),
        pending: Number(t.pending || 0),
      })),
    };
  }

  async findTransaction(id: string, user: UserEntity, lang: string) {
    const tx = await this.txOrFail(id, lang);
    const ctx = await this.access.context(user, tx.companyId, lang);
    this.access.assertAccountAllowed(ctx, tx.accountId, lang);
    let transfer: any = null;
    if (tx.transferId) {
      transfer = await this.m.findOne(CashTransfer, { where: { id: tx.transferId }, relations: { fromAccount: true, toAccount: true } });
    }
    // ✅ Circuit de validation (niveaux, validateurs, état)
    const approval = await this.approvals.forTarget(
      tx.transferId ? CashApprovalTarget.TRANSFER : CashApprovalTarget.TRANSACTION,
      tx.transferId ?? tx.id,
      user,
    );
    return { message: this.t('cash_flow.transaction', lang), data: { ...this.serializeTx(tx), transfer, approval } };
  }

  /** Modifier : caissier = ses mouvements en attente ; responsable = tout mouvement non verrouillé (hors transferts) */
  async updateTransaction(id: string, dto: UpdateCashTransactionDto, file: File, user: UserEntity, lang: string) {
    const tx = await this.txOrFail(id, lang);
    const ctx = await this.access.context(user, tx.companyId, lang, FinanceRole.CASHIER);
    this.access.assertAccountAllowed(ctx, tx.accountId, lang);
    if (tx.transferId || tx.closingId) throw new BadRequestException(this.t('cash_flow.transfer_not_editable', lang));
    if ([CashTransactionStatus.CANCELLED, CashTransactionStatus.REJECTED].includes(tx.status)) {
      throw new BadRequestException(this.t('cash_flow.transaction_closed', lang));
    }
    if (!this.access.isManager(ctx) && (tx.status !== CashTransactionStatus.PENDING || tx.createdById !== user.id)) {
      throw new ForbiddenException(this.t('cash_flow.edit_forbidden', lang));
    }
    const oldDate = dateStr(tx.transactionDate)!;
    const newDate = dto.transactionDate ?? oldDate;
    if (newDate > today()) throw new BadRequestException(this.t('cash_flow.future_date', lang));
    await this.access.assertNotLocked(tx.accountId, oldDate < newDate ? oldDate : newDate, lang);

    const newUrl = await this.images.upload(file, 'finance/cash-flow', true);
    try {
      await this.access.dataSource.transaction(async (m) => {
        const acc = await this.accountOrFail(tx.accountId, lang, m, true);
        const row = await this.txOrFail(id, lang, m, true);
        if (dto.categoryId !== undefined) {
          const cat = await this.categoryFor(ctx.companyId, dto.categoryId, row.direction, lang, m);
          if (cat?.isSystem) throw new BadRequestException(this.t('cash_flow.category_system', lang));
          row.categoryId = cat?.id ?? null;
        }
        if (dto.amount !== undefined && round2(dto.amount) !== Number(row.amount)) {
          // Sortie validée plus élevée : le solde doit suivre
          if (row.status === CashTransactionStatus.VALIDATED && row.direction === CashDirection.OUT && !acc.allowNegative) {
            const balance = await this.access.balanceOf(acc.companyId, acc.id, null, m);
            if (balance + Number(row.amount) - dto.amount < -0.001) {
              throw new BadRequestException(this.t('cash_flow.insufficient_balance', lang, { balance, currency: acc.currency, amount: dto.amount }));
            }
          }
          // Entrée validée plus faible : le solde ne doit pas devenir négatif
          if (row.status === CashTransactionStatus.VALIDATED && row.direction === CashDirection.IN && !acc.allowNegative) {
            const balance = await this.access.balanceOf(acc.companyId, acc.id, null, m);
            if (balance - Number(row.amount) + dto.amount < -0.001) {
              throw new BadRequestException(this.t('cash_flow.would_be_negative', lang));
            }
          }
          row.amount = round2(dto.amount);
        }
        row.transactionDate = newDate;
        if (dto.paymentMethod !== undefined) row.paymentMethod = dto.paymentMethod || null;
        if (dto.counterpartyName !== undefined) row.counterpartyName = dto.counterpartyName || null;
        if (dto.counterpartyPhone !== undefined) row.counterpartyPhone = dto.counterpartyPhone || null;
        if (dto.description !== undefined) row.description = dto.description || null;
        if (dto.documentNumber !== undefined) row.documentNumber = dto.documentNumber || null;
        if (newUrl || dto.attachmentUrl !== undefined || dto.removeAttachment) {
          const old = row.attachmentUrl;
          row.attachmentUrl = newUrl ?? (dto.removeAttachment ? null : dto.attachmentUrl || null);
          if (old && old !== row.attachmentUrl) void this.images.remove(old);
        }
        await m.save(CashTransaction, row);
      });
    } catch (e) {
      if (newUrl) await this.images.remove(newUrl);
      throw e;
    }
    // ✅ Montant modifié pendant la validation : le circuit recommence
    if (tx.status === CashTransactionStatus.PENDING && dto.amount !== undefined && round2(dto.amount) !== Number(tx.amount)) {
      await this.approvals
        .restart(
          ctx,
          CashApprovalTarget.TRANSACTION,
          id,
          {
            scope: tx.direction === CashDirection.IN ? CashApprovalScope.IN : CashApprovalScope.OUT,
            amount: round2(dto.amount),
            currency: tx.currency,
            categoryId: dto.categoryId !== undefined ? dto.categoryId : tx.categoryId,
            accountIds: [tx.accountId],
          },
          user,
          lang,
        )
        .catch((e) => this.logger.warn(`Circuit de validation (modification ${tx.reference}) : ${e?.message}`));
    }
    return { message: this.t('cash_flow.transaction_updated', lang), data: await this.reload(id) };
  }

  /** Responsable financier : valider un mouvement en attente (vérifie le solde) */
  async validateTransaction(id: string, user: UserEntity, lang: string, notify = true) {
    const tx = await this.txOrFail(id, lang);
    // Un transfert se valide en entier (sortie + entrée + frais)
    const transferKey = tx.transferId ?? (tx.sourceType === 'TRANSFER' ? tx.sourceId : null);
    if (transferKey) {
      const res = await this.validateTransfer(transferKey, user, lang);
      return { message: res.message, data: await this.reload(id) };
    }
    // ✅ Circuit de validation en cours : « Valider » = valider le niveau en cours
    const approval = await this.approvals.pendingFor(CashApprovalTarget.TRANSACTION, id);
    if (approval) {
      const res = await this.approvals.approve(approval.id, user, {}, lang);
      return { message: res.message, data: await this.reload(id) };
    }
    await this.access.context(user, tx.companyId, lang, FinanceRole.MANAGER);
    return this.doValidateTransaction(id, user, lang, notify);
  }

  /** Validation effective (solde contrôlé) — sans contrôle de rôle : appelée par le circuit ou un responsable */
  private async doValidateTransaction(id: string, user: UserEntity, lang: string, notify = true) {
    const tx = await this.txOrFail(id, lang);
    const ctx = { companyId: tx.companyId };
    const saved = await this.access.dataSource.transaction(async (m) => {
      const acc = await this.accountOrFail(tx.accountId, lang, m, true);
      const row = await this.txOrFail(id, lang, m, true);
      if (row.status !== CashTransactionStatus.PENDING) throw new BadRequestException(this.t('cash_flow.not_pending', lang));
      await this.access.assertNotLocked(acc.id, dateStr(row.transactionDate)!, lang, m);
      if (row.direction === CashDirection.OUT) await this.assertFunds(acc, Number(row.amount), lang, m);
      row.status = CashTransactionStatus.VALIDATED;
      row.validatedById = user.id;
      row.validatedAt = new Date();
      return m.save(CashTransaction, row);
    });
    if (notify && saved.createdById && saved.createdById !== user.id) {
      void this.access.notify([saved.createdById], 'validated', { reference: saved.reference, amount: saved.amount, currency: saved.currency }, { transactionId: saved.id, companyId: ctx.companyId }, lang);
    }
    void this.lowBalanceAlert(saved.accountId, lang);
    return { message: this.t('cash_flow.transaction_validated', lang), data: await this.reload(id) };
  }

  /** Valider plusieurs mouvements ; renvoie ceux qui ont échoué et pourquoi */
  async bulkValidate(dto: BulkValidateDto, user: UserEntity, lang: string) {
    const ok: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of [...new Set(dto.ids)]) {
      try {
        await this.validateTransaction(id, user, lang);
        ok.push(id);
      } catch (e: any) {
        failed.push({ id, error: e?.response?.message ?? e?.message ?? 'Erreur' });
      }
    }
    return { message: this.t('cash_flow.bulk_validated', lang, { count: ok.length }), data: { validated: ok, failed } };
  }

  async rejectTransaction(id: string, dto: RejectCashTransactionDto, user: UserEntity, lang: string) {
    const tx = await this.txOrFail(id, lang);
    // ✅ Circuit de validation en cours : refus par un validateur du niveau (ou propriétaire)
    const transferKey0 = tx.transferId ?? (tx.sourceType === 'TRANSFER' ? tx.sourceId : null);
    const approval = transferKey0
      ? await this.approvals.pendingFor(CashApprovalTarget.TRANSFER, transferKey0)
      : await this.approvals.pendingFor(CashApprovalTarget.TRANSACTION, id);
    if (approval) {
      const res = await this.approvals.reject(approval.id, user, { reason: dto.reason }, lang);
      return { message: res.message, data: await this.reload(id) };
    }
    await this.access.context(user, tx.companyId, lang, FinanceRole.MANAGER);
    return this.doRejectTransaction(id, dto.reason, user, lang);
  }

  /** Refus effectif (mouvement ou transfert entier) — sans contrôle de rôle */
  private async doRejectTransaction(id: string, reason: string, user: UserEntity, lang: string) {
    const dto = { reason };
    const tx = await this.txOrFail(id, lang);
    const ctx = { companyId: tx.companyId };
    if (tx.status !== CashTransactionStatus.PENDING) throw new BadRequestException(this.t('cash_flow.not_pending', lang));
    const patch = { status: CashTransactionStatus.REJECTED, rejectionReason: dto.reason, validatedById: user.id, validatedAt: new Date() };
    await this.m.update(CashTransaction, { id }, patch);
    // Transfert : tous ses mouvements sont refusés
    const transferKey = tx.transferId ?? (tx.sourceType === 'TRANSFER' ? tx.sourceId : null);
    if (transferKey) {
      await this.m.update(CashTransaction, { transferId: transferKey, status: CashTransactionStatus.PENDING }, patch);
      await this.m.update(CashTransaction, { sourceType: 'TRANSFER', sourceId: transferKey, status: CashTransactionStatus.PENDING }, patch);
      await this.m.update(CashTransfer, { id: transferKey }, { status: CashTransactionStatus.REJECTED });
    }
    if (tx.createdById && tx.createdById !== user.id) {
      void this.access.notify([tx.createdById], 'rejected', { reference: tx.reference, reason: dto.reason }, { transactionId: tx.id, companyId: ctx.companyId }, lang);
    }
    return { message: this.t('cash_flow.transaction_rejected', lang), data: await this.reload(id) };
  }

  /**
   * Responsable financier : annuler un mouvement validé (il n'est plus compté).
   * Rien n'est supprimé. Un transfert est annulé en entier.
   */
  async cancelTransaction(id: string, dto: CancelCashTransactionDto, user: UserEntity, lang: string) {
    const tx = await this.txOrFail(id, lang);
    await this.access.context(user, tx.companyId, lang, FinanceRole.MANAGER);
    if (tx.status === CashTransactionStatus.CANCELLED) throw new BadRequestException(this.t('cash_flow.already_cancelled', lang));
    if (tx.status === CashTransactionStatus.REJECTED) throw new BadRequestException(this.t('cash_flow.transaction_closed', lang));
    if (tx.closingId) throw new BadRequestException(this.t('cash_flow.transfer_not_editable', lang));

    await this.access.dataSource.transaction(async (m) => {
      // Transfert : sortie + entrée + frais annulés ensemble
      const rows = tx.transferId
        ? await m.find(CashTransaction, {
          where: [{ transferId: tx.transferId }, { sourceType: 'TRANSFER', sourceId: tx.transferId }],
          lock: { mode: 'pessimistic_write' },
        })
        : [await this.txOrFail(id, lang, m, true)];
      for (const r of rows) {
        await this.access.assertNotLocked(r.accountId, dateStr(r.transactionDate)!, lang, m);
        // Annuler une ENTRÉE validée ne doit pas rendre une caisse négative
        if (r.status === CashTransactionStatus.VALIDATED && r.direction === CashDirection.IN) {
          const acc = await this.accountOrFail(r.accountId, lang, m, true);
          if (!acc.allowNegative) {
            const balance = await this.access.balanceOf(acc.companyId, acc.id, null, m);
            if (balance - Number(r.amount) < -0.001) throw new BadRequestException(this.t('cash_flow.would_be_negative', lang));
          }
        }
      }
      const now = new Date();
      for (const r of rows) {
        if (r.status === CashTransactionStatus.CANCELLED || r.status === CashTransactionStatus.REJECTED) continue;
        r.status = CashTransactionStatus.CANCELLED;
        r.cancelledById = user.id;
        r.cancelledAt = now;
        r.cancellationReason = dto.reason;
        await m.save(CashTransaction, r);
      }
      if (tx.transferId) await m.update(CashTransfer, { id: tx.transferId }, { status: CashTransactionStatus.CANCELLED });
    });
    // ✅ Demande de validation en cours : annulée aussi (sonnerie arrêtée)
    if (tx.status === CashTransactionStatus.PENDING) {
      await this.approvals
        .closeForTarget(tx.transferId ? CashApprovalTarget.TRANSFER : CashApprovalTarget.TRANSACTION, tx.transferId ?? id, CashApprovalStatus.CANCELLED, user, dto.reason)
        .catch(() => undefined);
    }
    return { message: this.t('cash_flow.transaction_cancelled', lang), data: await this.reload(id) };
  }

  // ============================================================
  // TRANSFERTS
  // ============================================================

  async createTransfer(dto: CreateCashTransferDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang, FinanceRole.CASHIER);
    if (dto.fromAccountId === dto.toAccountId) throw new BadRequestException(this.t('cash_flow.transfer_same_account', lang));
    this.access.assertAccountAllowed(ctx, dto.fromAccountId, lang);
    this.access.assertAccountAllowed(ctx, dto.toAccountId, lang);
    const date = dto.transferDate ?? today();
    if (date > today()) throw new BadRequestException(this.t('cash_flow.future_date', lang));

    const result = await this.access.dataSource.transaction(async (m) => {
      // Verrou dans un ordre fixe (évite les interblocages)
      const [idA, idB] = [dto.fromAccountId, dto.toAccountId].sort();
      const a = await this.accountOrFail(idA, lang, m, true);
      const b = await this.accountOrFail(idB, lang, m, true);
      const from = a.id === dto.fromAccountId ? a : b;
      const to = a.id === dto.toAccountId ? a : b;
      if (from.companyId !== ctx.companyId || to.companyId !== ctx.companyId) throw new NotFoundException(this.t('cash_flow.account_not_found', lang));
      if (!from.isActive || !to.isActive) throw new BadRequestException(this.t('cash_flow.account_inactive', lang));
      await this.access.assertNotLocked(from.id, date, lang, m);
      await this.access.assertNotLocked(to.id, date, lang, m);

      // Montant reçu : même devise = montant ; sinon montant reçu envoyé, taux envoyé ou taux exchange_rates
      let rate = 1;
      let received = round2(dto.amount);
      if (from.currency !== to.currency) {
        if (dto.receivedAmount) {
          received = round2(dto.receivedAmount);
          rate = Math.round((received / dto.amount) * 1e6) / 1e6;
        } else if (dto.exchangeRate) {
          rate = dto.exchangeRate;
          received = round2(dto.amount * rate);
        } else {
          const conv = await new RateCache(m).convert(dto.amount, from.currency, to.currency);
          if (conv === null) throw new BadRequestException(this.t('cash_flow.rate_missing', lang, { from: from.currency, to: to.currency }));
          received = conv;
          rate = Math.round((conv / dto.amount) * 1e6) / 1e6;
        }
      }
      const fees = round2(dto.fees ?? 0);
      // ✅ Circuit de validation des transferts
      const plan: CashApprovalPlan | null = await this.approvals.plan(
        ctx,
        { scope: CashApprovalScope.TRANSFER, amount: dto.amount, currency: from.currency, accountIds: [from.id, to.id] },
        user,
        m,
      );
      const pending = !!plan;
      if (!pending) await this.assertFunds(from, dto.amount + fees, lang, m);
      const status = pending ? CashTransactionStatus.PENDING : CashTransactionStatus.VALIDATED;

      const transfer = await m.save(
        CashTransfer,
        m.create(CashTransfer, {
          companyId: ctx.companyId,
          reference: reference('TRF'),
          fromAccountId: from.id,
          toAccountId: to.id,
          amount: round2(dto.amount),
          fromCurrency: from.currency,
          toCurrency: to.currency,
          exchangeRate: rate,
          receivedAmount: received,
          fees,
          transferDate: date,
          status,
          description: dto.description ?? null,
          createdById: user.id,
        }),
      );
      const common = {
        companyId: ctx.companyId,
        transactionDate: date,
        status,
        transferId: transfer.id,
        createdById: user.id,
        validatedById: pending ? null : user.id,
        validatedAt: pending ? null : new Date(),
      };
      const label = dto.description || this.t('cash_flow.transfer_label', lang, { from: from.name, to: to.name });
      const rows = [
        m.create(CashTransaction, {
          ...common,
          reference: `${transfer.reference}-S`,
          accountId: from.id,
          direction: CashDirection.OUT,
          amount: round2(dto.amount),
          currency: from.currency,
          paymentMethod: this.defaultMethod(from.type),
          description: label,
          branchId: from.branchId ?? null,
        }),
        m.create(CashTransaction, {
          ...common,
          reference: `${transfer.reference}-E`,
          accountId: to.id,
          direction: CashDirection.IN,
          amount: received,
          currency: to.currency,
          paymentMethod: this.defaultMethod(to.type),
          description: label,
          branchId: to.branchId ?? null,
        }),
      ];
      if (fees > 0) {
        // Les frais sont une vraie dépense : ils apparaissent dans les sorties (pas de transferId)
        const feeCat = await this.systemCategory(ctx.companyId, SYSTEM_CATEGORY.TRANSFER_FEES, m);
        rows.push(
          m.create(CashTransaction, {
            ...common,
            transferId: null,
            reference: `${transfer.reference}-F`,
            accountId: from.id,
            categoryId: feeCat?.id ?? null,
            direction: CashDirection.OUT,
            amount: fees,
            currency: from.currency,
            paymentMethod: this.defaultMethod(from.type),
            description: this.t('cash_flow.transfer_fees_label', lang, { reference: transfer.reference }),
            sourceType: 'TRANSFER',
            sourceId: transfer.id,
            branchId: from.branchId ?? null,
          }),
        );
      }
      await m.save(CashTransaction, rows);
      const approval = plan
        ? await this.approvals.submit(
          m,
          plan,
          {
            type: CashApprovalTarget.TRANSFER,
            id: transfer.id,
            reference: transfer.reference,
            direction: null,
            amount: Number(transfer.amount),
            currency: transfer.fromCurrency,
            summary: label,
          },
          user,
          ctx.companyId,
        )
        : null;
      return Object.assign(transfer, { approvalId: approval?.id ?? null });
    });

    if (result.status === CashTransactionStatus.PENDING) {
      if ((result as any).approvalId) void this.approvals.announce((result as any).approvalId, lang, { byUserId: user.id });
    } else {
      void this.lowBalanceAlert(result.fromAccountId, lang);
    }
    return { message: this.t('cash_flow.transfer_created', lang), data: await this.transferDetail(result.id) };
  }

  private async transferDetail(id: string) {
    const tr = await this.m.findOne(CashTransfer, { where: { id }, relations: { fromAccount: true, toAccount: true } });
    const txs = await this.m.find(CashTransaction, {
      where: [{ transferId: id }, { sourceType: 'TRANSFER', sourceId: id }],
      relations: { account: true, category: true },
      order: { reference: 'ASC' },
    });
    return tr ? { ...tr, transactions: txs.map((t) => this.serializeTx(t)) } : null;
  }

  /** Valider un transfert en attente : ses 2 (ou 3) mouvements ensemble */
  async validateTransfer(id: string, user: UserEntity, lang: string) {
    const tr0 = await this.m.findOne(CashTransfer, { where: { id } });
    if (!tr0) throw new NotFoundException(this.t('cash_flow.transfer_not_found', lang));
    // ✅ Circuit de validation en cours : valider le niveau en cours
    const approval = await this.approvals.pendingFor(CashApprovalTarget.TRANSFER, id);
    if (approval) {
      const res = await this.approvals.approve(approval.id, user, {}, lang);
      return { message: res.message, data: await this.transferDetail(id) };
    }
    await this.access.context(user, tr0.companyId, lang, FinanceRole.MANAGER);
    return this.doValidateTransfer(id, user, lang);
  }

  /** Validation effective d'un transfert (solde contrôlé) — sans contrôle de rôle */
  private async doValidateTransfer(id: string, user: UserEntity, lang: string) {
    const tr = await this.m.findOne(CashTransfer, { where: { id } });
    if (!tr) throw new NotFoundException(this.t('cash_flow.transfer_not_found', lang));
    if (tr.status !== CashTransactionStatus.PENDING) throw new BadRequestException(this.t('cash_flow.not_pending', lang));
    await this.access.dataSource.transaction(async (m) => {
      const from = await this.accountOrFail(tr.fromAccountId, lang, m, true);
      await this.assertFunds(from, Number(tr.amount) + Number(tr.fees || 0), lang, m);
      const now = new Date();
      const patch = { status: CashTransactionStatus.VALIDATED, validatedById: user.id, validatedAt: now };
      await m.update(CashTransaction, { transferId: id, status: CashTransactionStatus.PENDING }, patch);
      await m.update(CashTransaction, { sourceType: 'TRANSFER', sourceId: id, status: CashTransactionStatus.PENDING }, patch);
      await m.update(CashTransfer, { id }, { status: CashTransactionStatus.VALIDATED });
    });
    if (tr.createdById && tr.createdById !== user.id) {
      void this.access.notify([tr.createdById], 'validated', { reference: tr.reference, amount: tr.amount, currency: tr.fromCurrency }, { transferId: id, companyId: tr.companyId }, lang);
    }
    return { message: this.t('cash_flow.transaction_validated', lang), data: await this.transferDetail(id) };
  }

  // ============================================================
  // ✅ APPELÉS PAR LE CIRCUIT DE VALIDATION
  // ============================================================

  /** Dernier niveau validé : l'opération est validée (contrôle du solde à ce moment) */
  async finalizeApprovedTarget(type: CashApprovalTarget, id: string, approver: UserEntity, lang: string) {
    if (type === CashApprovalTarget.TRANSFER) return this.doValidateTransfer(id, approver, lang);
    return this.doValidateTransaction(id, approver, lang, false);
  }

  /** Refus dans le circuit : l'opération (ou le transfert entier) est refusée */
  async rejectApprovedTarget(type: CashApprovalTarget, id: string, reason: string, approver: UserEntity, lang: string) {
    if (type === CashApprovalTarget.TRANSFER) {
      const out = await this.m.findOne(CashTransaction, { where: { transferId: id, status: CashTransactionStatus.PENDING } });
      if (out) await this.doRejectTransaction(out.id, reason, approver, lang);
      else await this.m.update(CashTransfer, { id }, { status: CashTransactionStatus.REJECTED });
      return;
    }
    await this.doRejectTransaction(id, reason, approver, lang);
  }

  /** Demande retirée : les mouvements en attente sont annulés */
  async withdrawApprovedTarget(type: CashApprovalTarget, id: string, reason: string, user: UserEntity, lang: string) {
    const patch = { status: CashTransactionStatus.CANCELLED, cancelledById: user.id, cancelledAt: new Date(), cancellationReason: reason };
    if (type === CashApprovalTarget.TRANSFER) {
      await this.m.update(CashTransaction, { transferId: id, status: CashTransactionStatus.PENDING }, patch);
      await this.m.update(CashTransaction, { sourceType: 'TRANSFER', sourceId: id, status: CashTransactionStatus.PENDING }, patch);
      await this.m.update(CashTransfer, { id, status: CashTransactionStatus.PENDING }, { status: CashTransactionStatus.CANCELLED });
      return;
    }
    const res = await this.m.update(CashTransaction, { id, status: CashTransactionStatus.PENDING }, patch);
    if (!res.affected) throw new BadRequestException(this.t('cash_flow.not_pending', lang));
  }

  /** Résumé de l'opération pour l'écran de validation */
  async transactionView(id: string) {
    return this.reload(id);
  }

  async transferView(id: string) {
    return this.transferDetail(id);
  }

  async listTransfers(q: CashTransactionQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, q.companyId, lang);
    const { page, limit, skip } = pageParams(q.page, q.limit);
    const qb = this.m
      .createQueryBuilder(CashTransfer, 'tr')
      .leftJoinAndSelect('tr.fromAccount', 'fromAccount')
      .leftJoinAndSelect('tr.toAccount', 'toAccount')
      .where('tr.companyId = :c', { c: ctx.companyId });
    if (ctx.accountIds) qb.andWhere('(tr.fromAccountId IN (:...ids) OR tr.toAccountId IN (:...ids))', { ids: ctx.accountIds });
    if (q.accountId) qb.andWhere('(tr.fromAccountId = :acc OR tr.toAccountId = :acc)', { acc: q.accountId });
    if (q.status) qb.andWhere('tr.status = :st', { st: q.status });
    if (q.from) qb.andWhere('tr.transferDate >= :from', { from: q.from });
    if (q.to) qb.andWhere('tr.transferDate <= :to', { to: q.to });
    const [rows, total] = await qb.orderBy('tr.transferDate', 'DESC').addOrderBy('tr.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    return { message: this.t('cash_flow.transfers', lang), ...new PaginatedResponseDto(rows, total, page, limit) };
  }

  // ============================================================
  // PRÉVISIONS
  // ============================================================

  async listForecasts(q: ForecastQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, q.companyId, lang);
    const qb = this.m.createQueryBuilder(CashForecast, 'f').leftJoinAndSelect('f.category', 'category').where('f.companyId = :c', { c: ctx.companyId });
    if (q.fromPeriod) qb.andWhere('f.period >= :fp', { fp: q.fromPeriod });
    if (q.toPeriod) qb.andWhere('f.period <= :tp', { tp: q.toPeriod });
    if (q.currency) qb.andWhere('f.currency = :cur', { cur: q.currency });
    const rows = await qb.orderBy('f.period', 'ASC').addOrderBy('category.direction', 'ASC').addOrderBy('category.position', 'ASC').getMany();
    return { message: this.t('cash_flow.forecasts', lang), data: rows };
  }

  async upsertForecasts(dto: UpsertForecastsDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang, FinanceRole.MANAGER);
    const catIds = [...new Set(dto.lines.map((l) => l.categoryId))];
    const cats = await this.m.find(CashCategory, { where: { companyId: ctx.companyId, id: In(catIds) } });
    if (cats.length !== catIds.length) throw new BadRequestException(this.t('cash_flow.category_not_found', lang));
    let saved = 0;
    let removed = 0;
    await this.access.dataSource.transaction(async (m) => {
      for (const l of dto.lines) {
        const currency = (l.currency || 'USD').toUpperCase();
        const existing = await m.findOne(CashForecast, { where: { companyId: ctx.companyId, categoryId: l.categoryId, period: l.period, currency } });
        if (!l.amount) {
          if (existing) {
            await m.delete(CashForecast, { id: existing.id });
            removed++;
          }
          continue;
        }
        if (existing) {
          existing.amount = round2(l.amount);
          if (l.notes !== undefined) existing.notes = l.notes || null;
          await m.save(CashForecast, existing);
        } else {
          await m.save(
            CashForecast,
            m.create(CashForecast, { companyId: ctx.companyId, categoryId: l.categoryId, period: l.period, amount: round2(l.amount), currency, notes: l.notes ?? null, createdById: user.id }),
          );
        }
        saved++;
      }
    });
    return { message: this.t('cash_flow.forecasts_saved', lang, { count: saved }), data: { saved, removed } };
  }

  async copyForecasts(dto: CopyForecastsDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang, FinanceRole.MANAGER);
    const source = await this.m.find(CashForecast, { where: { companyId: ctx.companyId, period: dto.fromPeriod } });
    if (!source.length) throw new BadRequestException(this.t('cash_flow.forecast_source_empty', lang, { period: dto.fromPeriod }));
    let created = 0;
    await this.access.dataSource.transaction(async (m) => {
      for (const period of [...new Set(dto.toPeriods)].filter((p) => p !== dto.fromPeriod)) {
        for (const f of source) {
          const existing = await m.findOne(CashForecast, { where: { companyId: ctx.companyId, categoryId: f.categoryId, period, currency: f.currency } });
          if (existing && !dto.overwrite) continue;
          if (existing) {
            existing.amount = f.amount;
            existing.notes = f.notes ?? null;
            await m.save(CashForecast, existing);
          } else {
            await m.save(CashForecast, m.create(CashForecast, { companyId: ctx.companyId, categoryId: f.categoryId, period, amount: f.amount, currency: f.currency, notes: f.notes ?? null, createdById: user.id }));
          }
          created++;
        }
      }
    });
    return { message: this.t('cash_flow.forecasts_saved', lang, { count: created }), data: { copied: created } };
  }

  // ============================================================
  // ARRÊTÉS DE CAISSE
  // ============================================================

  async createClosing(dto: CreateCashClosingDto, user: UserEntity, lang: string) {
    const acc0 = await this.accountOrFail(dto.accountId, lang);
    const ctx = await this.access.context(user, acc0.companyId, lang, FinanceRole.CASHIER);
    this.access.assertAccountAllowed(ctx, acc0.id, lang);
    if (dto.adjust && !this.access.isManager(ctx)) throw new ForbiddenException(this.t('cash_flow.adjust_manager_only', lang));
    const date = dto.closingDate ?? today();
    if (date > today()) throw new BadRequestException(this.t('cash_flow.future_date', lang));

    const fromNotes = dto.denominations?.length ? round2(dto.denominations.reduce((s, d) => s + Number(d.value) * Number(d.count), 0)) : null;
    const counted = dto.countedBalance ?? fromNotes;
    if (counted === null || counted === undefined) throw new BadRequestException(this.t('cash_flow.counted_required', lang));
    if (fromNotes !== null && dto.countedBalance !== undefined && Math.abs(fromNotes - dto.countedBalance) > 0.009) {
      throw new BadRequestException(this.t('cash_flow.denominations_mismatch', lang, { total: fromNotes }));
    }

    const closing = await this.access.dataSource.transaction(async (m) => {
      const acc = await this.accountOrFail(dto.accountId, lang, m, true);
      const lock = await this.access.lockDate(acc.id, m);
      if (lock && date <= lock) throw new BadRequestException(this.t('cash_flow.period_locked', lang, { date: lock }));
      const pending = await m.count(CashTransaction, { where: { accountId: acc.id, status: CashTransactionStatus.PENDING } });
      const pendingBefore = pending
        ? Number((await m.query("SELECT COUNT(*) AS n FROM bo_cash_transactions WHERE accountId = ? AND status = 'PENDING' AND transactionDate <= ?", [acc.id, date]))[0]?.n || 0)
        : 0;
      if (pendingBefore) throw new BadRequestException(this.t('cash_flow.closing_has_pending', lang, { count: pendingBefore }));

      const expected = await this.access.balanceOf(acc.companyId, acc.id, date, m);
      const difference = round2(counted - expected);
      const row = await m.save(
        CashClosing,
        m.create(CashClosing, {
          companyId: acc.companyId,
          reference: reference('ARR'),
          accountId: acc.id,
          closingDate: date,
          currency: acc.currency,
          expectedBalance: expected,
          countedBalance: round2(counted),
          difference,
          denominations: dto.denominations?.length ? dto.denominations.map((d) => ({ value: Number(d.value), count: Number(d.count) })) : null,
          notes: dto.notes ?? null,
          closedById: user.id,
        }),
      );
      if (dto.adjust && Math.abs(difference) >= 0.01) {
        const gain = difference > 0;
        const cat = await this.systemCategory(acc.companyId, gain ? SYSTEM_CATEGORY.CASH_GAIN : SYSTEM_CATEGORY.CASH_LOSS, m);
        const adj = await m.save(
          CashTransaction,
          m.create(CashTransaction, {
            companyId: acc.companyId,
            reference: `${row.reference}-ECART`,
            accountId: acc.id,
            categoryId: cat?.id ?? null,
            direction: gain ? CashDirection.IN : CashDirection.OUT,
            amount: Math.abs(difference),
            currency: acc.currency,
            transactionDate: date,
            status: CashTransactionStatus.VALIDATED,
            paymentMethod: 'CASH',
            description: this.t('cash_flow.adjustment_label', lang, { reference: row.reference }),
            closingId: row.id,
            branchId: acc.branchId ?? null,
            createdById: user.id,
            validatedById: user.id,
            validatedAt: new Date(),
          }),
        );
        row.adjustmentTransactionId = adj.id;
        await m.save(CashClosing, row);
      }
      return row;
    });

    if (Math.abs(Number(closing.difference)) >= 0.01) {
      void this.access.notify(
        (await this.access.managerIds(ctx.companyId)).filter((id) => id !== user.id),
        'closing_difference',
        { account: acc0.name, difference: closing.difference, currency: closing.currency },
        { closingId: closing.id, accountId: acc0.id, companyId: ctx.companyId },
        lang,
      );
    }
    return {
      message: this.t(Math.abs(Number(closing.difference)) < 0.01 ? 'cash_flow.closing_ok' : 'cash_flow.closing_difference', lang, {
        difference: closing.difference,
        currency: closing.currency,
      }),
      data: await this.m.findOne(CashClosing, { where: { id: closing.id }, relations: { account: true, closedBy: true } }),
    };
  }

  /** Solde théorique d'un compte à une date (avant de compter la caisse) */
  async expectedBalance(accountId: string, date: string | undefined, user: UserEntity, lang: string) {
    const acc = await this.accountOrFail(accountId, lang);
    const ctx = await this.access.context(user, acc.companyId, lang);
    this.access.assertAccountAllowed(ctx, acc.id, lang);
    const d = date ?? today();
    const pending = Number((await this.m.query("SELECT COUNT(*) AS n FROM bo_cash_transactions WHERE accountId = ? AND status = 'PENDING' AND transactionDate <= ?", [acc.id, d]))[0]?.n || 0);
    return {
      message: this.t('cash_flow.expected_balance', lang),
      data: {
        accountId: acc.id,
        date: d,
        currency: acc.currency,
        expectedBalance: await this.access.balanceOf(acc.companyId, acc.id, d),
        pendingCount: pending,
        lockedUntil: await this.access.lockDate(acc.id),
      },
    };
  }

  async listClosings(q: CashClosingQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, q.companyId, lang);
    const { page, limit, skip } = pageParams(q.page, q.limit);
    const qb = this.m
      .createQueryBuilder(CashClosing, 'c')
      .leftJoinAndSelect('c.account', 'account')
      .leftJoinAndSelect('c.closedBy', 'closedBy')
      .where('c.companyId = :co', { co: ctx.companyId });
    if (ctx.accountIds) qb.andWhere('c.accountId IN (:...ids)', { ids: ctx.accountIds });
    if (q.accountId) qb.andWhere('c.accountId = :acc', { acc: q.accountId });
    if (q.from) qb.andWhere('c.closingDate >= :from', { from: q.from });
    if (q.to) qb.andWhere('c.closingDate <= :to', { to: q.to });
    const [rows, total] = await qb.orderBy('c.closingDate', 'DESC').addOrderBy('c.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    const data = rows.map((r) => ({ ...r, closedBy: this.person(r.closedBy) }));
    return { message: this.t('cash_flow.closings', lang), ...new PaginatedResponseDto(data, total, page, limit) };
  }
}
