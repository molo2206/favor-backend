import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { FilesService } from 'src/files/files.service';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { isPlatformAdmin, reference as makeReference } from 'src/backOffice/logistics/common/logistics-access';
import { CashFlowService } from 'src/backOffice/finance/cash-flow/cash-flow.service';
import { CashDirection } from 'src/backOffice/finance/cash-flow/common/cash-flow.enums';
import { NeedContext, NeedRates, NeedsAccessService, Person, round2, today } from './common/needs-access.service';
import {
  NeedAction,
  NeedExecutionStatus,
  NeedFinanceStatus,
  NeedLevelStatus,
  NeedPriority,
  NeedStatus,
  NeedStepState,
} from './common/needs.enums';
import { NeedAttachment, NeedDisbursement, NeedItem, NeedLevelState, NeedLog, NeedRequest } from './entities/need.entity';
import { NeedRule } from './entities/need-config.entity';
import { NeedSignature, NeedSignatureRole } from './entities/need-signature.entity';
import { NeedsWorkflowService } from './needs-workflow.service';
import {
  CancelNeedDto,
  CreateNeedDto,
  NeedAuthorizeDto,
  NeedDisburseDto,
  NeedExecutionDto,
  NeedItemDto,
  NeedQueryDto,
  NeedTransmitDto,
  UpdateNeedDto,
} from './dto/needs.dto';

const MAX_FILE_BYTES = () => Math.max(1, Number(process.env.NEEDS_MAX_FILE_MB || 15)) * 1024 * 1024;
const PRIORITY_RANK: Record<string, number> = { VERY_URGENT: 3, URGENT: 2, NORMAL: 1 };

/** Champs suivis dans l'historique des modifications */
const TRACKED: (keyof NeedRequest)[] = ['title', 'description', 'category', 'priority', 'justification', 'neededBy', 'currency', 'departmentId'];

/**
 * ✅ ÉTATS DE BESOINS : création (brouillon), modification, pièces jointes, suivi, finance
 * (transmission, autorisation, décaissements), exécution, listes et fiches.
 * Le circuit de validation est dans NeedsWorkflowService.
 */
@Injectable()
export class NeedsService {
  private readonly logger = new Logger(NeedsService.name);

  constructor(
    private readonly access: NeedsAccessService,
    private readonly workflow: NeedsWorkflowService,
    private readonly files: FilesService,
    private readonly cashFlow: CashFlowService,
  ) { }

  private get m() {
    return this.access.m;
  }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.access.t(key, lang, params);
  }

  get slaHours() {
    return this.access.envNum('NEEDS_SLA_HOURS', 48, 1);
  }

  // ============================================================
  // ACCÈS À UNE DEMANDE
  // ============================================================

  async load(id: string, lang: string, m: EntityManager = this.m): Promise<NeedRequest> {
    const n = await m.findOne(NeedRequest, { where: { id } });
    if (!n) throw new NotFoundException(this.t('needs.not_found', lang));
    return n;
  }

  /** Voir : demandeur, validateurs (tous niveaux, remplaçants, escalade), admin / finance / lecteur */
  canView(n: NeedRequest, ctx: NeedContext): boolean {
    if (n.companyId !== ctx.companyId && !this.access.isAdmin(ctx)) return false;
    if (n.requesterId === ctx.user.id || this.access.seesAll(ctx)) return true;
    if (n.status === NeedStatus.DRAFT) return false;
    return (n.levels ?? []).some((l) => l.approverIds.includes(ctx.user.id) || l.substituteIds.includes(ctx.user.id) || l.escalateToIds.includes(ctx.user.id));
  }

  async contextFor(n: NeedRequest, user: UserEntity, lang: string): Promise<NeedContext> {
    const ctx = await this.access.context(user, n.companyId, lang).catch(() => null);
    const c: NeedContext = ctx ?? { companyId: n.companyId, role: null, user };
    if (!this.canView(n, c)) {
      // délégué d'un validateur absent
      const inbox = await this.workflow.inboxIds(n.companyId, user.id).catch(() => [] as string[]);
      if (!inbox.includes(n.id)) throw new ForbiddenException(this.t('needs.forbidden', lang));
    }
    return c;
  }

  // ============================================================
  // ARTICLES / MONTANTS
  // ============================================================

  private itemRows(needId: string, items: NeedItemDto[]): Partial<NeedItem>[] {
    return items.map((it, i) => {
      const quantity = round2(it.quantity);
      const unitPrice = round2(it.unitPrice);
      return {
        needId,
        position: i,
        designation: it.designation,
        description: it.description ?? null,
        unit: it.unit ?? null,
        quantity,
        unitPrice,
        total: round2(quantity * unitPrice),
      };
    });
  }

  private async replaceItems(m: EntityManager, needId: string, items: NeedItemDto[]): Promise<number> {
    const old = await m.find(NeedItem, { where: { needId } });
    const keep = new Map(old.map((o) => [o.id, o]));
    const rows = this.itemRows(needId, items);
    const used = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const id = items[i].id;
      if (id && keep.has(id)) {
        used.add(id);
        await m.update(NeedItem, { id }, rows[i] as any);
      } else {
        await m.insert(NeedItem, rows[i] as any);
      }
    }
    const remove = old.filter((o) => !used.has(o.id)).map((o) => o.id);
    if (remove.length) await m.delete(NeedItem, { id: In(remove) });
    return round2(rows.reduce((s, r) => s + Number(r.total || 0), 0));
  }

  private async resolveDepartment(ctx: NeedContext, departmentId: string | undefined | null, userId: string, lang: string, m: EntityManager) {
    if (departmentId) {
      const d = await this.access.department(departmentId, m);
      if (!d) throw new BadRequestException(this.t('needs.department_not_found_id', lang, { id: departmentId }));
      // Département rattaché à une autre entreprise : accepté si le demandeur appartient aussi à cette entreprise
      // (ex. départements RH créés sous Favor Group, état de besoin saisi depuis FavorHelp)
      if (d.companyId && d.companyId !== ctx.companyId && !isPlatformAdmin(ctx.user)) {
        const member = await m.query(
          'SELECT 1 FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ? LIMIT 1',
          [userId, d.companyId],
        );
        if (!member?.length) throw new BadRequestException(this.t('needs.department_other_company', lang, { name: d.name }));
      }
      return d;
    }
    return this.access.departmentOf(userId, ctx.companyId, m);
  }

  /**
   * Départements à proposer dans le formulaire : ceux de l'entreprise active (et ceux sans entreprise),
   * plus le département de la fiche employé du demandeur (sélectionné par défaut).
   */
  async departments(user: UserEntity, companyId: string | undefined, lang: string) {
    const ctx = await this.access.context(user, companyId, lang);
    let rows: any[] = [];
    try {
      rows = await this.access.dataSource.query(
        'SELECT * FROM `hr_departments` WHERE (`companyId` = ? OR `companyId` IS NULL) ORDER BY `name` ASC',
        [ctx.companyId],
      );
    } catch (e: any) {
      this.logger.warn(`Liste des départements impossible : ${e?.message}`);
      rows = [];
    }
    const mine = await this.access.departmentOf(user.id, ctx.companyId);
    const list = rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentDepartmentId ?? r.parentId ?? null,
      managerId: r.managerId ?? null,
      companyId: r.companyId ?? null,
    }));
    if (mine && !list.some((d) => d.id === mine.id)) {
      list.unshift({ id: mine.id, name: mine.name, parentId: mine.parentId, managerId: mine.managerId, companyId: null });
    }
    return {
      message: this.t('needs.departments_fetched', lang),
      data: { companyId: ctx.companyId, defaultDepartmentId: mine?.id ?? null, departments: list },
    };
  }

  // ============================================================
  // CRÉATION / MODIFICATION (agent)
  // ============================================================

  async create(dto: CreateNeedDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, dto.companyId, lang);
    const saved = await this.access.dataSource.transaction(async (m) => {
      const dept = await this.resolveDepartment(ctx, dto.departmentId, user.id, lang, m);
      let n: NeedRequest | null = null;
      for (let attempt = 0; attempt < 5 && !n; attempt++) {
        try {
          n = await m.save(
            NeedRequest,
            m.create(NeedRequest, {
              companyId: ctx.companyId,
              reference: makeReference('EB'),
              requesterId: user.id,
              requesterName: user.fullName ?? null,
              departmentId: dept?.id ?? null,
              departmentName: dept?.name ?? null,
              title: dto.title,
              description: dto.description ?? null,
              category: dto.category,
              priority: dto.priority ?? NeedPriority.NORMAL,
              justification: dto.justification ?? null,
              neededBy: dto.neededBy ?? null,
              currency: (dto.currency || 'USD').toUpperCase(),
              estimatedTotal: 0,
              status: NeedStatus.DRAFT,
              financeStatus: NeedFinanceStatus.NONE,
              executionStatus: NeedExecutionStatus.NOT_STARTED,
            } as Partial<NeedRequest>),
          );
        } catch (e: any) {
          if (!String(e?.message || '').includes('Duplicate')) throw e;
        }
      }
      if (!n) throw new ConflictException(this.t('needs.reference_failed', lang));
      if (dto.items?.length) {
        n.estimatedTotal = await this.replaceItems(m, n.id, dto.items);
        n.estimatedTotalUsd = await new NeedRates(m).convert(n.estimatedTotal, n.currency, 'USD');
        await m.update(NeedRequest, { id: n.id }, { estimatedTotal: n.estimatedTotal, estimatedTotalUsd: n.estimatedTotalUsd });
      }
      await this.access.log(m, n.id, NeedAction.CREATED, user, {
        toStatus: NeedStatus.DRAFT,
        payload: { title: n.title, category: n.category, priority: n.priority, items: dto.items?.length ?? 0, total: n.estimatedTotal, currency: n.currency },
      });
      return n;
    });
    if (dto.submit) await this.workflow.submit(saved.id, user, lang);
    return { message: this.t(dto.submit ? 'needs.submitted' : 'needs.draft_saved', lang), data: await this.detail(saved.id, user, lang) };
  }

  async update(id: string, dto: UpdateNeedDto, user: UserEntity, lang: string) {
    await this.access.dataSource.transaction(async (m) => {
      const n = await m.findOne(NeedRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!n) throw new NotFoundException(this.t('needs.not_found', lang));
      if (n.requesterId !== user.id) throw new ForbiddenException(this.t('needs.only_requester', lang));
      if (![NeedStatus.DRAFT, NeedStatus.CORRECTION_REQUESTED].includes(n.status)) {
        throw new BadRequestException(this.t('needs.not_editable', lang, { status: n.status }));
      }
      if (dto.version !== undefined && dto.version !== n.version) throw new ConflictException(this.t('needs.version_conflict', lang));
      const ctx = await this.access.context(user, n.companyId, lang);

      const before: Record<string, any> = {};
      const after: Record<string, any> = {};
      const set = (k: keyof NeedRequest, v: any) => {
        if (v === undefined) return;
        if (String((n as any)[k] ?? '') !== String(v ?? '')) {
          before[k as string] = (n as any)[k] ?? null;
          after[k as string] = v ?? null;
          (n as any)[k] = v;
        }
      };
      set('title', dto.title);
      set('description', dto.description);
      set('category', dto.category);
      set('priority', dto.priority);
      set('justification', dto.justification);
      set('neededBy', dto.neededBy);
      if (dto.currency) set('currency', dto.currency.toUpperCase());
      if (dto.departmentId !== undefined) {
        const dept = await this.resolveDepartment(ctx, dto.departmentId, user.id, lang, m);
        set('departmentId', dept?.id ?? null);
        n.departmentName = dept?.name ?? null;
      }

      let itemsChange: any = null;
      if (dto.items) {
        const oldItems = await m.find(NeedItem, { where: { needId: n.id }, order: { position: 'ASC' } });
        const total = await this.replaceItems(m, n.id, dto.items);
        itemsChange = {
          before: oldItems.map((i) => ({ designation: i.designation, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), total: Number(i.total) })),
          after: dto.items.map((i) => ({ designation: i.designation, quantity: i.quantity, unitPrice: i.unitPrice, total: round2(i.quantity * i.unitPrice) })),
          totalBefore: Number(n.estimatedTotal),
          totalAfter: total,
        };
        n.estimatedTotal = total;
      }
      n.estimatedTotalUsd = await new NeedRates(m).convert(Number(n.estimatedTotal), n.currency, 'USD');
      await m.save(NeedRequest, n);
      if (Object.keys(after).length) await this.access.log(m, n.id, NeedAction.UPDATED, user, { payload: { before, after } });
      if (itemsChange) await this.access.log(m, n.id, NeedAction.ITEMS_UPDATED, user, { payload: itemsChange });
    });
    return { message: this.t('needs.updated', lang), data: await this.detail(id, user, lang) };
  }

  async submit(id: string, user: UserEntity, lang: string, comment?: string | null) {
    await this.workflow.submit(id, user, lang, comment);
    return { message: this.t('needs.submitted', lang), data: await this.detail(id, user, lang) };
  }

  async cancel(id: string, dto: CancelNeedDto, user: UserEntity, lang: string) {
    const res = await this.access.dataSource.transaction(async (m) => {
      const n = await m.findOne(NeedRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!n) throw new NotFoundException(this.t('needs.not_found', lang));
      const ctx = await this.access.context(user, n.companyId, lang);
      const isRequester = n.requesterId === user.id;
      const openForRequester = [NeedStatus.DRAFT, NeedStatus.PENDING, NeedStatus.CORRECTION_REQUESTED].includes(n.status);
      if (!(isRequester && openForRequester) && !this.access.isAdmin(ctx)) throw new ForbiddenException(this.t('needs.cannot_cancel', lang));
      if ([NeedStatus.CANCELLED, NeedStatus.REJECTED].includes(n.status)) throw new BadRequestException(this.t('needs.already_closed', lang));
      if (Number(n.disbursedTotal) > 0) throw new BadRequestException(this.t('needs.cannot_cancel_paid', lang));
      const from = n.status;
      const lvl = this.workflow.current(n);
      n.status = NeedStatus.CANCELLED;
      n.cancelledAt = new Date();
      n.cancelReason = dto.reason;
      n.currentLevel = 0;
      await m.save(NeedRequest, n);
      await this.access.log(m, n.id, NeedAction.CANCELLED, user, { fromStatus: from, toStatus: NeedStatus.CANCELLED, comment: dto.reason });
      return { n, lvl };
    });
    if (res.lvl) this.access.stopRinging([...res.lvl.approverIds, ...res.lvl.substituteIds], res.n.id, res.lvl.level, 'CANCELLED');
    if (res.n.requesterId !== user.id) void this.access.notify([res.n.requesterId], 'cancelled', { ...this.workflow.params(res.n), reason: dto.reason }, this.workflow.data(res.n), lang);
    this.workflow.emitUpdated(res.n);
    return { message: this.t('needs.cancelled', lang), data: await this.detail(id, user, lang) };
  }

  /** Commentaire / observation (sans décision) */
  async comment(id: string, text: string, user: UserEntity, lang: string) {
    const n = await this.load(id, lang);
    await this.contextFor(n, user, lang);
    await this.access.log(this.m, n.id, NeedAction.COMMENT, user, { level: n.currentLevel, comment: text });
    // Prévenir l'autre partie : le demandeur, ou les validateurs du niveau en cours
    const lvl = this.workflow.current(n);
    const to = user.id === n.requesterId ? (lvl ? await this.workflow.targetsOf(n, lvl) : []) : [n.requesterId];
    void this.access.notify(to.filter((x) => x !== user.id), 'comment', { ...this.workflow.params(n), author: user.fullName || '', comment: text.slice(0, 140) }, this.workflow.data(n), lang);
    return { message: this.t('needs.comment_added', lang), data: await this.detail(id, user, lang) };
  }

  // ============================================================
  // PIÈCES JOINTES
  // ============================================================

  async addAttachments(id: string, files: Express.Multer.File[], kind: string | undefined, user: UserEntity, lang: string, disbursementId: string | null = null, m: EntityManager = this.m) {
    const n = await this.load(id, lang, m);
    const ctx = await this.contextFor(n, user, lang);
    if (!files?.length) throw new BadRequestException(this.t('needs.files_required', lang));
    if (n.status === NeedStatus.CANCELLED) throw new BadRequestException(this.t('needs.already_closed', lang));
    const k = (kind || 'OTHER').toUpperCase();
    if (k === 'PAYMENT_PROOF' && !this.access.isFinance(ctx)) throw new ForbiddenException(this.t('needs.finance_only', lang));
    const uploaded = await this.files.uploadFilesDetailed(files, `backoffice/needs/${n.companyId}`, {
      imageMaxWidth: 1800,
      imageQuality: 82,
      imageThumbnail: true,
      maxSize: MAX_FILE_BYTES(),
    });
    const rows: NeedAttachment[] = [];
    for (const f of uploaded) {
      rows.push(
        await m.save(
          NeedAttachment,
          m.create(NeedAttachment, {
            needId: n.id,
            kind: k,
            url: f.url,
            name: f.originalName?.slice(0, 255) ?? null,
            mimeType: f.mimeType ?? null,
            size: f.size ?? null,
            disbursementId,
            uploadedById: user.id,
          }),
        ),
      );
    }
    await this.access.log(m, n.id, NeedAction.ATTACHMENT_ADDED, user, { payload: { kind: k, files: rows.map((r) => ({ id: r.id, name: r.name, url: r.url })), disbursementId } });
    return rows;
  }

  async uploadAttachments(id: string, files: Express.Multer.File[], kind: string | undefined, user: UserEntity, lang: string) {
    await this.addAttachments(id, files, kind, user, lang);
    return { message: this.t('needs.attachments_added', lang), data: await this.detail(id, user, lang) };
  }

  async removeAttachment(id: string, attachmentId: string, user: UserEntity, lang: string) {
    const n = await this.load(id, lang);
    const ctx = await this.contextFor(n, user, lang);
    const a = await this.m.findOne(NeedAttachment, { where: { id: attachmentId, needId: id } });
    if (!a) throw new NotFoundException(this.t('needs.attachment_not_found', lang));
    const ownDraft = a.uploadedById === user.id && [NeedStatus.DRAFT, NeedStatus.CORRECTION_REQUESTED].includes(n.status);
    if (!ownDraft && !this.access.isAdmin(ctx)) throw new ForbiddenException(this.t('needs.cannot_remove_attachment', lang));
    await this.m.delete(NeedAttachment, { id: a.id });
    await this.files.deleteFileByUrl(a.url).catch(() => false);
    await this.access.log(this.m, n.id, NeedAction.ATTACHMENT_REMOVED, user, { payload: { id: a.id, name: a.name, kind: a.kind } });
    return { message: this.t('needs.attachment_removed', lang), data: await this.detail(id, user, lang) };
  }

  // ============================================================
  // FINANCE : transmission → autorisation → décaissements (≠ validation)
  // ============================================================

  async transmit(id: string, dto: NeedTransmitDto, user: UserEntity, lang: string) {
    const n = await this.access.dataSource.transaction(async (m) => {
      const n = await m.findOne(NeedRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!n) throw new NotFoundException(this.t('needs.not_found', lang));
      const ctx = await this.access.context(user, n.companyId, lang);
      if (!this.access.isFinance(ctx) && n.requesterId !== user.id) throw new ForbiddenException(this.t('needs.finance_only', lang));
      if (n.status !== NeedStatus.VALIDATED) throw new BadRequestException(this.t('needs.not_validated', lang));
      if (n.financeStatus !== NeedFinanceStatus.NONE) throw new BadRequestException(this.t('needs.already_transmitted', lang));
      n.financeStatus = NeedFinanceStatus.TRANSMITTED;
      n.transmittedAt = new Date();
      await m.save(NeedRequest, n);
      await this.access.log(m, n.id, NeedAction.TRANSMITTED, user, { fromStatus: NeedFinanceStatus.NONE, toStatus: NeedFinanceStatus.TRANSMITTED, comment: dto.note ?? null });
      return n;
    });
    const to = (await this.access.financeIds(n.companyId)).filter((x) => x !== user.id);
    const sent = await this.access.notify(to, 'to_finance', this.workflow.params(n), this.workflow.data(n), lang);
    await this.access.log(this.m, n.id, NeedAction.NOTIFIED, null, { payload: { key: 'to_finance', to: sent } });
    return { message: this.t('needs.transmitted', lang), data: await this.detail(id, user, lang) };
  }

  async authorize(id: string, dto: NeedAuthorizeDto, user: UserEntity, lang: string) {
    const n = await this.access.dataSource.transaction(async (m) => {
      const n = await m.findOne(NeedRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!n) throw new NotFoundException(this.t('needs.not_found', lang));
      const ctx = await this.access.context(user, n.companyId, lang);
      this.access.assertFinance(ctx, lang);
      if (n.status !== NeedStatus.VALIDATED) throw new BadRequestException(this.t('needs.not_validated', lang));
      if (n.financeStatus === NeedFinanceStatus.PAID) throw new BadRequestException(this.t('needs.already_paid', lang));
      const max = Number(n.approvedAmount ?? n.estimatedTotal);
      if (dto.amount > max) throw new BadRequestException(this.t('needs.authorized_too_high', lang, { max, currency: n.currency }));
      if (dto.amount < Number(n.disbursedTotal)) throw new BadRequestException(this.t('needs.authorized_below_paid', lang, { paid: Number(n.disbursedTotal), currency: n.currency }));
      const from = n.financeStatus;
      n.authorizedAmount = round2(dto.amount);
      n.authorizedById = user.id;
      n.authorizedAt = new Date();
      n.authorizationNote = dto.note ?? null;
      n.transmittedAt = n.transmittedAt ?? new Date();
      n.financeStatus = Number(n.disbursedTotal) <= 0 ? NeedFinanceStatus.AUTHORIZED : Number(n.disbursedTotal) >= n.authorizedAmount ? NeedFinanceStatus.PAID : NeedFinanceStatus.PARTIALLY_PAID;
      // ✅ Signature de l'autorisation financière (remplace une autorisation précédente)
      await this.access.sign(m, n, user, { role: NeedSignatureRole.FINANCE, action: 'AUTHORIZED', replace: true }, lang);
      await m.save(NeedRequest, n);
      await this.access.log(m, n.id, NeedAction.AUTHORIZED, user, {
        fromStatus: from,
        toStatus: n.financeStatus,
        comment: dto.note ?? null,
        payload: { authorizedAmount: n.authorizedAmount, approvedAmount: max, currency: n.currency },
      });
      return n;
    });
    void this.access.notify([n.requesterId], 'authorized', { ...this.workflow.params(n), amount: Number(n.authorizedAmount) }, this.workflow.data(n), lang);
    this.workflow.emitUpdated(n);
    return { message: this.t('needs.authorized', lang), data: await this.detail(id, user, lang) };
  }

  /**
   * Décaissement (paiement partiel possible). Avec `cashAccountId`, la sortie est aussi
   * enregistrée dans la Trésorerie (même devise que la demande ; elle peut y attendre une validation).
   */
  async disburse(id: string, dto: NeedDisburseDto, files: Express.Multer.File[], user: UserEntity, lang: string) {
    const date = dto.paidAt ?? today();
    if (date > today()) throw new BadRequestException(this.t('needs.future_date', lang));
    const res = await this.access.dataSource.transaction(async (m) => {
      const n = await m.findOne(NeedRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!n) throw new NotFoundException(this.t('needs.not_found', lang));
      const ctx = await this.access.context(user, n.companyId, lang);
      this.access.assertFinance(ctx, lang);
      if (n.status !== NeedStatus.VALIDATED) throw new BadRequestException(this.t('needs.not_validated', lang));
      if (![NeedFinanceStatus.AUTHORIZED, NeedFinanceStatus.PARTIALLY_PAID].includes(n.financeStatus)) {
        throw new BadRequestException(this.t('needs.not_authorized', lang));
      }
      const remaining = round2(Number(n.authorizedAmount) - Number(n.disbursedTotal));
      if (dto.amount > remaining) throw new BadRequestException(this.t('needs.disbursement_too_high', lang, { remaining, currency: n.currency }));
      if (dto.cashAccountId) {
        const acc: any[] = await m.query('SELECT currency, companyId FROM bo_cash_accounts WHERE id = ? LIMIT 1', [dto.cashAccountId]);
        if (!acc[0] || acc[0].companyId !== n.companyId) throw new BadRequestException(this.t('needs.cash_account_not_found', lang));
        if (String(acc[0].currency).toUpperCase() !== n.currency.toUpperCase()) {
          throw new BadRequestException(this.t('needs.cash_account_currency', lang, { account: acc[0].currency, currency: n.currency }));
        }
      }
      const payer = dto.paidById ? (await this.access.people([dto.paidById], m)).get(dto.paidById) : null;
      if (dto.paidById && !payer) throw new BadRequestException(this.t('needs.payer_not_found', lang));
      const d = await m.save(
        NeedDisbursement,
        m.create(NeedDisbursement, {
          needId: n.id,
          amount: round2(dto.amount),
          currency: n.currency,
          paidAt: date,
          paidById: payer?.id ?? user.id,
          paidByName: payer?.fullName ?? user.fullName ?? null,
          beneficiary: dto.beneficiary ?? null,
          paymentMethod: dto.paymentMethod ?? null,
          paymentReference: dto.paymentReference ?? null,
          note: dto.note ?? null,
          cashAccountId: dto.cashAccountId ?? null,
          recordedById: user.id,
        }),
      );
      // ✅ Signature du décaissement (celui qui l'enregistre)
      await this.access.sign(m, n, user, { role: NeedSignatureRole.CASHIER, action: 'DISBURSED', refId: d.id }, lang);
      const from = n.financeStatus;
      n.disbursedTotal = round2(Number(n.disbursedTotal) + Number(d.amount));
      n.lastDisbursedAt = date;
      n.financeStatus = n.disbursedTotal >= Number(n.authorizedAmount) ? NeedFinanceStatus.PAID : NeedFinanceStatus.PARTIALLY_PAID;
      await m.save(NeedRequest, n);
      await this.access.log(m, n.id, NeedAction.DISBURSED, user, {
        fromStatus: from,
        toStatus: n.financeStatus,
        comment: dto.note ?? null,
        payload: {
          disbursementId: d.id,
          amount: Number(d.amount),
          currency: d.currency,
          paidAt: d.paidAt,
          paidById: d.paidById,
          paidByName: d.paidByName,
          paymentMethod: d.paymentMethod,
          paymentReference: d.paymentReference,
          beneficiary: d.beneficiary,
          disbursedTotal: n.disbursedTotal,
          authorizedAmount: Number(n.authorizedAmount),
        },
      });
      return { n, d };
    });

    // Sortie de caisse dans la Trésorerie (compensation si elle échoue)
    if (dto.cashAccountId) {
      try {
        const tx: any = await this.cashFlow.createTransaction(
          {
            companyId: res.n.companyId,
            accountId: dto.cashAccountId,
            direction: CashDirection.OUT,
            categoryId: dto.cashCategoryId,
            amount: Number(res.d.amount),
            transactionDate: date,
            paymentMethod: dto.paymentMethod,
            counterpartyName: dto.beneficiary,
            description: `${res.n.reference} — ${res.n.title}`.slice(0, 500),
            documentNumber: dto.paymentReference,
            sourceType: 'NEED',
            sourceId: res.n.id,
          } as any,
          undefined as any,
          user,
          lang,
        );
        const txId = tx?.data?.id ?? null;
        if (txId) {
          await this.m.update(NeedDisbursement, { id: res.d.id }, { cashTransactionId: txId });
          await this.access.log(this.m, res.n.id, NeedAction.DISBURSED, user, { payload: { disbursementId: res.d.id, cashTransactionId: txId, cashStatus: tx?.data?.status ?? null } });
        }
      } catch (e: any) {
        await this.revertDisbursement(res.d.id, user, e?.response?.message ?? e?.message);
        throw e;
      }
    }

    if (files?.length) await this.addAttachments(id, files, 'PAYMENT_PROOF', user, lang, res.d.id).catch((e) => this.logger.warn(`Justificatif de paiement : ${e?.message}`));
    void this.access.notify([res.n.requesterId], res.n.financeStatus === NeedFinanceStatus.PAID ? 'paid' : 'partially_paid', { ...this.workflow.params(res.n), paid: Number(res.d.amount), total: res.n.disbursedTotal }, this.workflow.data(res.n), lang);
    this.workflow.emitUpdated(res.n);
    return { message: this.t('needs.disbursed', lang), data: await this.detail(id, user, lang) };
  }

  private async revertDisbursement(disbursementId: string, user: UserEntity, reason: string) {
    await this.access.dataSource.transaction(async (m) => {
      const d = await m.findOne(NeedDisbursement, { where: { id: disbursementId } });
      if (!d) return;
      const n = await m.findOne(NeedRequest, { where: { id: d.needId }, lock: { mode: 'pessimistic_write' } });
      if (!n) return;
      n.disbursedTotal = round2(Math.max(0, Number(n.disbursedTotal) - Number(d.amount)));
      n.financeStatus = n.disbursedTotal <= 0 ? NeedFinanceStatus.AUTHORIZED : NeedFinanceStatus.PARTIALLY_PAID;
      await m.delete(NeedDisbursement, { id: d.id });
      await m.delete(NeedSignature, { refId: d.id }).catch(() => undefined);
      await m.save(NeedRequest, n);
      await this.access.log(m, n.id, NeedAction.DISBURSED, user, { comment: `Annulé : la sortie de caisse a échoué (${String(reason).slice(0, 300)})`, payload: { reverted: true, disbursementId, amount: Number(d.amount) } });
    });
  }

  // ============================================================
  // EXÉCUTION (≠ paiement)
  // ============================================================

  async execution(id: string, dto: NeedExecutionDto, files: Express.Multer.File[], user: UserEntity, lang: string) {
    const n = await this.access.dataSource.transaction(async (m) => {
      const n = await m.findOne(NeedRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!n) throw new NotFoundException(this.t('needs.not_found', lang));
      const ctx = await this.access.context(user, n.companyId, lang);
      if (!this.access.isFinance(ctx) && n.requesterId !== user.id) throw new ForbiddenException(this.t('needs.cannot_execute', lang));
      if (n.status !== NeedStatus.VALIDATED) throw new BadRequestException(this.t('needs.not_validated', lang));
      const items = await m.find(NeedItem, { where: { needId: n.id } });
      const changes: any[] = [];
      for (const line of dto.items ?? []) {
        const it = items.find((i) => i.id === line.itemId);
        if (!it) throw new BadRequestException(this.t('needs.item_not_found', lang));
        if (line.executedQuantity > Number(it.quantity)) throw new BadRequestException(this.t('needs.executed_too_high', lang, { item: it.designation, max: Number(it.quantity) }));
        changes.push({ itemId: it.id, designation: it.designation, before: Number(it.executedQuantity), after: line.executedQuantity });
        it.executedQuantity = round2(line.executedQuantity);
        await m.update(NeedItem, { id: it.id }, { executedQuantity: it.executedQuantity });
      }
      const value = items.reduce((s, i) => s + Number(i.total || 0), 0);
      const done = items.reduce((s, i) => s + Math.min(Number(i.executedQuantity), Number(i.quantity)) * Number(i.unitPrice || 0), 0);
      const qty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
      const qtyDone = items.reduce((s, i) => s + Math.min(Number(i.executedQuantity), Number(i.quantity)), 0);
      const rate = value > 0 ? Math.round((done / value) * 100) : qty > 0 ? Math.round((qtyDone / qty) * 100) : 0;
      const derived =
        rate >= 100 ? NeedExecutionStatus.COMPLETED : rate > 0 ? NeedExecutionStatus.PARTIAL : NeedExecutionStatus.IN_PROGRESS;
      const from = n.executionStatus;
      n.executionStatus = dto.status ?? (dto.items?.length ? derived : n.executionStatus === NeedExecutionStatus.NOT_STARTED ? NeedExecutionStatus.IN_PROGRESS : n.executionStatus);
      n.executionRate = n.executionStatus === NeedExecutionStatus.COMPLETED && !dto.items?.length ? 100 : rate;
      if (dto.note !== undefined) n.executionNote = dto.note;
      n.executedAt = n.executionStatus === NeedExecutionStatus.COMPLETED ? new Date() : null;
      await m.save(NeedRequest, n);
      await this.access.log(m, n.id, NeedAction.EXECUTION_UPDATED, user, {
        fromStatus: from,
        toStatus: n.executionStatus,
        comment: dto.note ?? null,
        payload: { rate: n.executionRate, items: changes },
      });
      return n;
    });
    if (files?.length) await this.addAttachments(id, files, 'EXECUTION_PROOF', user, lang).catch((e) => this.logger.warn(`Preuve d'exécution : ${e?.message}`));
    const to = [n.requesterId, ...(await this.access.financeIds(n.companyId))].filter((x) => x !== user.id);
    void this.access.notify(to, n.executionStatus === NeedExecutionStatus.COMPLETED ? 'executed' : 'execution_updated', { ...this.workflow.params(n), rate: n.executionRate }, this.workflow.data(n), lang);
    this.workflow.emitUpdated(n);
    return { message: this.t('needs.execution_saved', lang), data: await this.detail(id, user, lang) };
  }

  // ============================================================
  // FICHE COMPLÈTE
  // ============================================================

  private personOf(map: Map<string, Person>, id?: string | null) {
    if (!id) return null;
    return map.get(id) ?? { id, fullName: null, phone: null, image: null };
  }

  /** Progression : Agent → niveaux → Service financier → Paiement → Exécution */
  steps(n: NeedRequest): { key: string; label: string; state: NeedStepState; at: string | null; level?: number }[] {
    const out: { key: string; label: string; state: NeedStepState; at: string | null; level?: number }[] = [];
    const submitted = n.status !== NeedStatus.DRAFT;
    out.push({ key: 'REQUESTER', label: 'Agent demandeur', state: submitted ? 'DONE' : 'CURRENT', at: n.submittedAt ? new Date(n.submittedAt).toISOString() : null });
    for (const l of n.levels ?? []) {
      const state: NeedStepState =
        l.status === NeedLevelStatus.APPROVED ? 'DONE'
          : l.status === NeedLevelStatus.CURRENT ? (n.status === NeedStatus.PENDING ? 'CURRENT' : 'WAITING')
            : l.status === NeedLevelStatus.REJECTED ? 'REJECTED'
              : l.status === NeedLevelStatus.RETURNED ? 'RETURNED'
                : l.status === NeedLevelStatus.SKIPPED ? 'SKIPPED'
                  : 'WAITING';
      out.push({ key: `LEVEL_${l.level}`, label: l.name, state, at: l.completedAt ?? l.startedAt ?? null, level: l.level });
    }
    const validated = n.status === NeedStatus.VALIDATED;
    const fin = n.financeStatus;
    out.push({
      key: 'FINANCE',
      label: 'Service financier',
      state: !validated ? 'WAITING' : [NeedFinanceStatus.AUTHORIZED, NeedFinanceStatus.PARTIALLY_PAID, NeedFinanceStatus.PAID].includes(fin) ? 'DONE' : 'CURRENT',
      at: n.authorizedAt ? new Date(n.authorizedAt).toISOString() : n.transmittedAt ? new Date(n.transmittedAt).toISOString() : null,
    });
    out.push({
      key: 'PAYMENT',
      label: 'Paiement',
      state: fin === NeedFinanceStatus.PAID ? 'DONE' : fin === NeedFinanceStatus.PARTIALLY_PAID || fin === NeedFinanceStatus.AUTHORIZED ? 'CURRENT' : 'WAITING',
      at: n.lastDisbursedAt ? String(n.lastDisbursedAt) : null,
    });
    out.push({
      key: 'EXECUTION',
      label: 'Exécution',
      state: n.executionStatus === NeedExecutionStatus.COMPLETED ? 'DONE' : n.executionStatus === NeedExecutionStatus.NOT_STARTED ? 'WAITING' : 'CURRENT',
      at: n.executedAt ? new Date(n.executedAt).toISOString() : null,
    });
    if (n.status === NeedStatus.REJECTED || n.status === NeedStatus.CANCELLED) {
      for (const s of out) if (s.state === 'WAITING' || s.state === 'CURRENT') s.state = s.key === 'REQUESTER' ? 'DONE' : 'WAITING';
    }
    return out;
  }

  async overdueInfo(n: NeedRequest, m: EntityManager = this.m) {
    if (n.status !== NeedStatus.PENDING || !n.levelStartedAt) return { overdue: false, waitingHours: null as number | null, slaHours: null as number | null };
    let sla = this.slaHours;
    if (n.ruleId) {
      const r = await m.findOne(NeedRule, { where: { id: n.ruleId } });
      if (r?.slaHours) sla = r.slaHours;
    }
    const hours = Math.round(((Date.now() - new Date(n.levelStartedAt).getTime()) / 3600000) * 10) / 10;
    return { overdue: hours > sla, waitingHours: hours, slaHours: sla };
  }

  async detail(id: string, user: UserEntity, lang: string) {
    const n = await this.load(id, lang);
    const ctx = await this.contextFor(n, user, lang);
    const [items, attachments, disbursements, logs] = await Promise.all([
      this.m.find(NeedItem, { where: { needId: id }, order: { position: 'ASC' } }),
      this.m.find(NeedAttachment, { where: { needId: id }, order: { createdAt: 'ASC' } }),
      this.m.find(NeedDisbursement, { where: { needId: id }, order: { paidAt: 'ASC', createdAt: 'ASC' } }),
      this.m.find(NeedLog, { where: { needId: id }, order: { createdAt: 'ASC' } }),
    ]);
    const levelIds = (n.levels ?? []).flatMap((l) => [...l.approverIds, ...l.substituteIds, ...l.approvals.map((a) => a.userId), l.decidedById ?? '']);
    const people = await this.access.people([n.requesterId, n.authorizedById, ...levelIds, ...attachments.map((a) => a.uploadedById), ...disbursements.map((d) => d.paidById), ...logs.map((l) => l.userId)]);
    const lvl = this.workflow.current(n);
    const actors = lvl && n.status === NeedStatus.PENDING ? (await this.workflow.actorsOf(n, lvl)).all : [];
    const isFinance = this.access.isFinance(ctx);
    const isAdmin = this.access.isAdmin(ctx);
    const mine = n.requesterId === user.id;
    const editable = mine && [NeedStatus.DRAFT, NeedStatus.CORRECTION_REQUESTED].includes(n.status);
    const canDecide = n.status === NeedStatus.PENDING && actors.includes(user.id) && !lvl!.approvals.some((a) => a.userId === user.id);
    const remaining = round2(Number(n.authorizedAmount ?? 0) - Number(n.disbursedTotal));

    return {
      ...n,
      requester: this.personOf(people, n.requesterId),
      approvedAmount: n.approvedAmount ?? null,
      authorizedBy: this.personOf(people, n.authorizedById),
      remainingToDisburse: n.authorizedAmount != null ? remaining : null,
      levels: (n.levels ?? []).map((l) => ({
        ...l,
        approvers: l.approverIds.map((uid) => this.personOf(people, uid)),
        substitutes: l.substituteIds.map((uid) => this.personOf(people, uid)),
        approvals: l.approvals.map((a) => ({ ...a, user: this.personOf(people, a.userId) })),
        decidedBy: this.personOf(people, l.decidedById),
      })),
      currentLevelName: lvl?.name ?? null,
      steps: this.steps(n),
      ...(await this.overdueInfo(n)),
      items,
      attachments: attachments.map((a) => ({ ...a, uploadedBy: this.personOf(people, a.uploadedById) })),
      disbursements: disbursements.map((d) => ({ ...d, paidBy: this.personOf(people, d.paidById) ?? { id: null, fullName: d.paidByName } })),
      history: logs.map((l) => ({ ...l, user: this.personOf(people, l.userId) ?? (l.userName ? { id: l.userId, fullName: l.userName } : null) })),
      // ✅ Signatures apposées (demandeur, validateurs, finance, décaissements)
      signatures: await this.access.signaturesOf(n.id),
      signatureRequired: this.access.signatureRequired,
      mySignatureUrl: (await this.access.employeeSignatures?.urlForUser(user.id, n.companyId))?.url ?? null,
      permissions: {
        role: ctx.role,
        canEdit: editable,
        canSubmit: editable,
        canCancel: (mine && [NeedStatus.DRAFT, NeedStatus.PENDING, NeedStatus.CORRECTION_REQUESTED].includes(n.status)) || (isAdmin && ![NeedStatus.CANCELLED, NeedStatus.REJECTED].includes(n.status) && Number(n.disbursedTotal) <= 0),
        canApprove: canDecide,
        canReject: canDecide,
        canRequestCorrection: canDecide,
        canOverride: isAdmin && n.status === NeedStatus.PENDING && !canDecide,
        canRemind: n.status === NeedStatus.PENDING && (mine || isAdmin),
        canComment: true,
        canTransmit: n.status === NeedStatus.VALIDATED && n.financeStatus === NeedFinanceStatus.NONE && (isFinance || mine),
        canAuthorize: n.status === NeedStatus.VALIDATED && isFinance && n.financeStatus !== NeedFinanceStatus.PAID,
        canDisburse: n.status === NeedStatus.VALIDATED && isFinance && [NeedFinanceStatus.AUTHORIZED, NeedFinanceStatus.PARTIALLY_PAID].includes(n.financeStatus) && remaining > 0,
        canUpdateExecution: n.status === NeedStatus.VALIDATED && (isFinance || mine),
        canAddAttachment: n.status !== NeedStatus.CANCELLED,
      },
    };
  }

  // ============================================================
  // LISTES (+ filtres communs au tableau de bord et aux exports)
  // ============================================================

  /** WHERE commun (alias n, règle nr) selon le rôle et les filtres */
  async whereFor(ctx: NeedContext, q: NeedQueryDto, lang = 'fr'): Promise<{ sql: string; params: any[] }> {
    const w: string[] = ['n.companyId = ?'];
    const p: any[] = [ctx.companyId];
    const scope = q.scope || (this.access.seesAll(ctx) ? 'all' : 'mine');
    const uid = ctx.user.id;

    if (scope === 'mine') {
      w.push('n.requesterId = ?');
      p.push(uid);
    } else if (scope === 'inbox') {
      const ids = await this.workflow.inboxIds(ctx.companyId, uid);
      if (!ids.length) w.push('1 = 0');
      else {
        w.push(`n.id IN (${ids.map(() => '?').join(',')})`);
        p.push(...ids);
      }
    } else if (scope === 'validated_by_me') {
      w.push("EXISTS (SELECT 1 FROM bo_need_logs l WHERE l.needId = n.id AND l.userId = ? AND l.action IN ('APPROVED','REJECTED','CORRECTION_REQUESTED','OVERRIDE'))");
      p.push(uid);
    } else if (scope === 'finance') {
      if (!this.access.isFinance(ctx)) throw new ForbiddenException(this.t('needs.finance_only', lang));
      w.push("n.status = 'VALIDATED'");
    } else if (!this.access.seesAll(ctx)) {
      // « all » sans rôle : mes demandes + celles où je suis validateur
      w.push("(n.requesterId = ? OR (n.status <> 'DRAFT' AND JSON_SEARCH(n.levels, 'one', ?) IS NOT NULL))");
      p.push(uid, uid);
    }
    if (scope !== 'mine') {
      // brouillons des autres : jamais visibles
      w.push("(n.status <> 'DRAFT' OR n.requesterId = ?)");
      p.push(uid);
    }

    if (q.status) {
      w.push('n.status = ?');
      p.push(q.status);
    }
    if (q.financeStatus) {
      w.push('n.financeStatus = ?');
      p.push(q.financeStatus);
    }
    if (q.executionStatus) {
      w.push('n.executionStatus = ?');
      p.push(q.executionStatus);
    }
    if (q.priority) {
      w.push('n.priority = ?');
      p.push(q.priority);
    }
    if (q.category) {
      w.push('n.category = ?');
      p.push(q.category);
    }
    if (q.departmentId) {
      w.push('n.departmentId = ?');
      p.push(q.departmentId);
    }
    if (q.requesterId) {
      w.push('n.requesterId = ?');
      p.push(q.requesterId);
    }
    if (q.validatorId) {
      w.push("JSON_SEARCH(n.levels, 'one', ?) IS NOT NULL");
      p.push(q.validatorId);
    }
    if (q.currency) {
      w.push('n.currency = ?');
      p.push(q.currency);
    }
    if (q.from) {
      w.push('COALESCE(n.submittedAt, n.createdAt) >= ?');
      p.push(`${q.from} 00:00:00`);
    }
    if (q.to) {
      w.push('COALESCE(n.submittedAt, n.createdAt) <= ?');
      p.push(`${q.to} 23:59:59`);
    }
    if (q.search) {
      w.push('(n.reference LIKE ? OR n.title LIKE ? OR n.requesterName LIKE ? OR n.departmentName LIKE ?)');
      const s = `%${q.search}%`;
      p.push(s, s, s, s);
    }
    if (q.overdue === 'true') {
      w.push("n.status = 'PENDING' AND n.levelStartedAt < DATE_SUB(NOW(), INTERVAL COALESCE(nr.slaHours, ?) HOUR)");
      p.push(this.slaHours);
    }
    return { sql: w.join(' AND '), params: p };
  }

  /** Ligne de liste (sans l'historique) */
  async rowView(n: NeedRequest, people: Map<string, Person>, userId: string, inbox: Set<string>) {
    const lvl = this.workflow.current(n);
    const od = await this.overdueInfo(n);
    return {
      id: n.id,
      reference: n.reference,
      title: n.title,
      category: n.category,
      priority: n.priority,
      status: n.status,
      financeStatus: n.financeStatus,
      executionStatus: n.executionStatus,
      executionRate: n.executionRate,
      currency: n.currency,
      estimatedTotal: Number(n.estimatedTotal),
      approvedAmount: n.approvedAmount ?? null,
      authorizedAmount: n.authorizedAmount ?? null,
      disbursedTotal: Number(n.disbursedTotal),
      requester: this.personOf(people, n.requesterId) ?? { id: n.requesterId, fullName: n.requesterName },
      departmentId: n.departmentId,
      departmentName: n.departmentName,
      currentLevel: n.currentLevel,
      currentLevelName: lvl?.name ?? null,
      currentApprovers: lvl && n.status === NeedStatus.PENDING ? lvl.approverIds.map((id) => this.personOf(people, id)) : [],
      levels: (n.levels ?? []).map((l) => ({ level: l.level, name: l.name, status: l.status })),
      steps: this.steps(n),
      waitingMyDecision: inbox.has(n.id),
      isMine: n.requesterId === userId,
      ...od,
      submittedAt: n.submittedAt,
      validatedAt: n.validatedAt,
      neededBy: n.neededBy,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }

  async list(q: NeedQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, q.companyId, lang);
    const { sql, params } = await this.whereFor(ctx, q, lang);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 20));
    const order = q.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const sortSql =
      q.sortBy === 'estimatedTotal' ? `n.estimatedTotalUsd ${order}, n.estimatedTotal ${order}`
        : q.sortBy === 'priority' ? `FIELD(n.priority, 'NORMAL', 'URGENT', 'VERY_URGENT') ${order}, n.createdAt DESC`
          : q.sortBy === 'submittedAt' ? `n.submittedAt ${order}`
            : `n.createdAt ${order}`;
    const base = `FROM bo_need_requests n LEFT JOIN bo_need_rules nr ON nr.id = n.ruleId WHERE ${sql}`;
    const [rows, total] = await Promise.all([
      this.m.query(`SELECT n.id ${base} ORDER BY ${sortSql}, n.id LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]),
      this.m.query(`SELECT COUNT(*) AS c ${base}`, params),
    ]);
    const ids: string[] = rows.map((r: any) => r.id);
    const needs = ids.length ? await this.m.find(NeedRequest, { where: { id: In(ids) } }) : [];
    const byId = new Map<string, NeedRequest>(needs.map((x: NeedRequest) => [x.id, x] as [string, NeedRequest]));
    const people = await this.access.people(needs.flatMap((x) => [x.requesterId, ...(this.workflow.current(x)?.approverIds ?? [])]));
    const inbox = new Set(await this.workflow.inboxIds(ctx.companyId, user.id));
    const data: any[] = [];
    for (const id of ids) {
      const n = byId.get(id);
      if (n) data.push(await this.rowView(n, people, user.id, inbox));
    }
    return { message: this.t('needs.list', lang), data: new PaginatedResponseDto<any>(data, Number(total[0]?.c || 0), page, limit) };
  }

  /** Mon accès + compteurs rapides (badge « à valider ») */
  async me(user: UserEntity, companyId: string | undefined, lang: string) {
    const ctx = await this.access.context(user, companyId, lang);
    const inbox = await this.workflow.inboxIds(ctx.companyId, user.id);
    const mine: any[] = await this.m.query(
      'SELECT status, COUNT(*) AS c FROM bo_need_requests WHERE companyId = ? AND requesterId = ? GROUP BY status',
      [ctx.companyId, user.id],
    );
    const financeQueue = this.access.isFinance(ctx)
      ? Number((await this.m.query("SELECT COUNT(*) AS c FROM bo_need_requests WHERE companyId = ? AND status = 'VALIDATED' AND financeStatus IN ('TRANSMITTED','AUTHORIZED','PARTIALLY_PAID')", [ctx.companyId]))[0]?.c || 0)
      : 0;
    const dept = await this.access.departmentOf(user.id, ctx.companyId);
    return {
      message: this.t('needs.me', lang),
      data: {
        companyId: ctx.companyId,
        role: ctx.role,
        isAdmin: this.access.isAdmin(ctx),
        isFinance: this.access.isFinance(ctx),
        seesAll: this.access.seesAll(ctx),
        department: dept ? { id: dept.id, name: dept.name } : null,
        toValidate: inbox.length,
        financeQueue,
        mine: Object.fromEntries(mine.map((r) => [r.status, Number(r.c)])),
      },
    };
  }
}
