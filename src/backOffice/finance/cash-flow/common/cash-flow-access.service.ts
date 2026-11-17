import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { NotificationsService } from 'src/notification/notifications.service';
import { FcmService } from 'src/notification/fcm.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { isCompanyOwner, isPlatformAdmin, resolveCompanyId } from 'src/backOffice/logistics/common/logistics-access';
import { FINANCE_ROLE_RANK, FinanceRole } from './cash-flow.enums';
import { FinanceMember } from '../entities/finance-member.entity';

export type FinanceContext = {
  companyId: string;
  role: FinanceRole;
  /** Comptes autorisés (caissier limité) ; null = tous */
  accountIds: string[] | null;
  user: UserEntity;
};

/** Taux de change en mémoire pendant une requête (exchange_rates : unités pour 1 USD) */
export class RateCache {
  private readonly cache = new Map<string, number | null>();
  readonly missing = new Set<string>();

  constructor(private readonly m: EntityManager) { }

  async rate(currency: string): Promise<number | null> {
    const cur = String(currency || '').trim().toUpperCase();
    if (!cur) return null;
    if (this.cache.has(cur)) return this.cache.get(cur)!;
    const rows = await this.m.query(
      'SELECT `value` FROM `exchange_rates` WHERE `currency` = ? AND `deleted` = 0 AND `status` = 1 ORDER BY `updatedAt` DESC LIMIT 1',
      [cur],
    );
    let v = Number(rows?.[0]?.value);
    if (!(v > 0)) v = cur === 'USD' ? 1 : NaN;
    const out = v > 0 ? v : null;
    this.cache.set(cur, out);
    return out;
  }

  /** Convertit ; null (et devise notée dans `missing`) si un taux manque */
  async convert(amount: number, from: string, to: string): Promise<number | null> {
    const f = String(from || '').toUpperCase();
    const t = String(to || '').toUpperCase();
    if (!f || !t || f === t) return round2(amount);
    const [rf, rt] = await Promise.all([this.rate(f), this.rate(t)]);
    if (!rf) this.missing.add(f);
    if (!rt) this.missing.add(t);
    if (!rf || !rt) return null;
    return round2((Number(amount) / rf) * rt);
  }
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Date du jour AAAA-MM-JJ (fuseau du serveur) */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Valeur de colonne DATE MySQL → AAAA-MM-JJ */
export function dateStr(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthStart(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function dayBefore(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const x = new Date(y, m - 1, d - 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/**
 * ✅ Accès à la trésorerie, notifications et soldes (partagé par les services du module).
 *  - admin plateforme et propriétaire de l'entreprise : MANAGER ;
 *  - membres désignés (bo_finance_members) : MANAGER, CASHIER ou VIEWER ;
 *  - autres : pas d'accès.
 */
@Injectable()
export class CashFlowAccessService {
  private readonly logger = new Logger(CashFlowAccessService.name);

  constructor(
    @InjectDataSource() readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly notifications: NotificationsService,
    private readonly fcm: FcmService,
  ) { }

  t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  get m(): EntityManager {
    return this.dataSource.manager;
  }

  /** Rôle de l'utilisateur dans la trésorerie de l'entreprise */
  async roleOf(user: UserEntity, companyId: string): Promise<{ role: FinanceRole | null; accountIds: string[] | null }> {
    if (isPlatformAdmin(user) || (await isCompanyOwner(this.dataSource, user, companyId))) {
      return { role: FinanceRole.MANAGER, accountIds: null };
    }
    const member = await this.m.findOne(FinanceMember, { where: { companyId, userId: user.id } });
    if (!member) return { role: null, accountIds: null };
    return { role: member.role, accountIds: member.accountIds?.length ? member.accountIds : null };
  }

  /** Entreprise + rôle minimum exigé */
  async context(user: UserEntity, companyId: string | undefined | null, lang: string, min: FinanceRole = FinanceRole.VIEWER): Promise<FinanceContext> {
    const id = await resolveCompanyId(this.dataSource, user, companyId, {
      required: this.t('cash_flow.company_required', lang),
      forbidden: this.t('cash_flow.forbidden', lang),
    });
    const { role, accountIds } = await this.roleOf(user, id);
    if (!role) throw new ForbiddenException(this.t('cash_flow.no_access', lang));
    if (FINANCE_ROLE_RANK[role] < FINANCE_ROLE_RANK[min]) {
      throw new ForbiddenException(this.t(min === FinanceRole.MANAGER ? 'cash_flow.manager_only' : 'cash_flow.cashier_only', lang));
    }
    return { companyId: id, role, accountIds: role === FinanceRole.MANAGER ? null : accountIds, user };
  }

  isManager(ctx: FinanceContext) {
    return ctx.role === FinanceRole.MANAGER;
  }

  /** Caissier limité à certains comptes */
  assertAccountAllowed(ctx: FinanceContext, accountId: string, lang: string) {
    if (ctx.accountIds && !ctx.accountIds.includes(accountId)) {
      throw new ForbiddenException(this.t('cash_flow.account_not_allowed', lang));
    }
  }

  /** Seuil (équivalent USD) au-delà duquel le mouvement d'un caissier attend une validation ; 0 = jamais */
  get approvalThresholdUsd(): number {
    const v = Number(process.env.CASH_FLOW_APPROVAL_THRESHOLD ?? 500);
    return Number.isFinite(v) && v >= 0 ? v : 500;
  }

  /** Le mouvement d'un caissier doit-il être validé ? */
  async needsApproval(ctx: FinanceContext, amount: number, currency: string): Promise<boolean> {
    if (this.isManager(ctx)) return false;
    const threshold = this.approvalThresholdUsd;
    if (threshold <= 0) return false;
    const usd = await new RateCache(this.m).convert(amount, currency, 'USD');
    return usd === null ? true : usd >= threshold;
  }

  // ============================================================
  // SOLDES
  // ============================================================

  /**
   * Soldes des comptes : solde d'ouverture + mouvements VALIDATED (jusqu'à `asOf` inclus si fourni).
   */
  async balances(companyId: string, opts: { accountIds?: string[]; asOf?: string | null } = {}, m: EntityManager = this.m): Promise<Map<string, number>> {
    const params: any[] = [companyId];
    let accSql = '';
    if (opts.accountIds?.length) {
      accSql = ` AND a.id IN (${opts.accountIds.map(() => '?').join(',')})`;
      params.push(...opts.accountIds);
    }
    const dateSql = opts.asOf ? ' AND t.transactionDate <= ?' : '';
    const rows: { id: string; opening: string; net: string | null }[] = await m.query(
      `SELECT a.id, a.openingBalance AS opening,
              (SELECT SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END)
                 FROM bo_cash_transactions t
                WHERE t.accountId = a.id AND t.status = 'VALIDATED'${dateSql}) AS net
         FROM bo_cash_accounts a
        WHERE a.companyId = ?${accSql}`,
      opts.asOf ? [opts.asOf, ...params] : params,
    );
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.id, round2(Number(r.opening || 0) + Number(r.net || 0)));
    return out;
  }

  async balanceOf(companyId: string, accountId: string, asOf?: string | null, m: EntityManager = this.m): Promise<number> {
    return (await this.balances(companyId, { accountIds: [accountId], asOf }, m)).get(accountId) ?? 0;
  }

  /** Dernier arrêté de caisse du compte : les mouvements datés de ce jour ou avant sont verrouillés */
  async lockDate(accountId: string, m: EntityManager = this.m): Promise<string | null> {
    const rows = await m.query("SELECT DATE_FORMAT(MAX(`closingDate`), '%Y-%m-%d') AS d FROM `bo_cash_closings` WHERE `accountId` = ?", [accountId]);
    return dateStr(rows?.[0]?.d);
  }

  async assertNotLocked(accountId: string, date: string, lang: string, m: EntityManager = this.m) {
    const lock = await this.lockDate(accountId, m);
    if (lock && date <= lock) throw new BadRequestException(this.t('cash_flow.period_locked', lang, { date: lock }));
  }

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  /** Responsables financiers : propriétaires + membres MANAGER */
  async managerIds(companyId: string): Promise<string[]> {
    const rows: { userId: string }[] = await this.dataSource.query(
      "SELECT `userId` FROM `user_has_company` WHERE `companyId` = ? AND `isOwner` = 1 UNION SELECT `userId` FROM `bo_finance_members` WHERE `companyId` = ? AND `role` = 'MANAGER'",
      [companyId, companyId],
    );
    return rows.map((r) => r.userId);
  }

  async notify(userIds: string[], key: string, params: Record<string, any>, data: Record<string, any>, lang: string) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    const title = this.t(`cash_flow.notif.${key}.title`, lang, params);
    const body = this.t(`cash_flow.notif.${key}.body`, lang, params);
    const payload = { category: 'finance', event: key, ...data };
    try {
      await this.notifications.sendAndSaveNotificationToUsers(ids, title, body, NotificationType.FINANCE, payload);
    } catch (e: any) {
      this.logger.warn(`Notification trésorerie : ${e?.message}`);
    }
    void this.fcm
      .sendPushToUsers(ids, title, body, { type: NotificationType.FINANCE, ...payload }, { tag: data.transactionId ? `cash-${data.transactionId}` : undefined })
      .catch((e) => this.logger.warn(`Push trésorerie : ${e?.message}`));
  }
}
