import { Injectable, NotFoundException } from '@nestjs/common';
import { UserEntity } from 'src/users/entities/user.entity';
import { CashActivity, CashDirection, CashTransactionStatus } from './common/cash-flow.enums';
import { CashFlowAccessService, FinanceContext, RateCache, addMonths, dateStr, dayBefore, monthStart, round2, today } from './common/cash-flow-access.service';
import { CashAccount } from './entities/cash-account.entity';
import { CashCategory } from './entities/cash-category.entity';
import { CashTransaction } from './entities/cash-transaction.entity';
import { CashFlowService } from './cash-flow.service';
import {
  CashReportQueryDto,
  CashTransactionQueryDto,
  ForecastVsActualQueryDto,
  LedgerQueryDto,
  ProjectionQueryDto,
} from './dto/cash-flow.dto';

const GROUP_FORMAT: Record<string, string> = {
  day: '%Y-%m-%d',
  week: '%x-S%v',
  month: '%Y-%m',
  year: '%Y',
};

const ACTIVITY_ORDER = [CashActivity.OPERATING, CashActivity.INVESTING, CashActivity.FINANCING];

type Raw = { currency: string; total: string | number; [k: string]: any };

/**
 * ✅ Rapports de trésorerie :
 *  - tableau de bord (soldes, entrées / sorties de la période, en attente, alertes, évolution sur 12 mois) ;
 *  - tableau des flux de trésorerie (ouverture → exploitation / investissement / financement → clôture) ;
 *  - prévisions vs réel par rubrique et par mois ;
 *  - projection du solde sur les mois à venir ;
 *  - grand livre d'un compte (solde après chaque mouvement) ;
 *  - export CSV des mouvements.
 * Les transferts internes changent les soldes mais ne sont jamais comptés comme entrées / sorties.
 * Les montants de devises différentes sont convertis (exchange_rates) dans la devise du rapport (USD par défaut).
 */
@Injectable()
export class CashFlowReportService {
  constructor(
    private readonly access: CashFlowAccessService,
    private readonly cash: CashFlowService,
  ) { }

  private get m() {
    return this.access.m;
  }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.access.t(key, lang, params);
  }

  /** Période : par défaut le mois en cours */
  private period(q: { from?: string; to?: string }) {
    return { from: q.from ?? monthStart(), to: q.to ?? today() };
  }

  /** Comptes du rapport (filtre compte / branche / caissier limité) */
  private async accountsFor(ctx: FinanceContext, q: { accountId?: string; branchId?: string }) {
    const qb = this.m.createQueryBuilder(CashAccount, 'a').where('a.companyId = :c', { c: ctx.companyId });
    if (q.accountId) qb.andWhere('a.id = :id', { id: q.accountId });
    if (q.branchId) qb.andWhere('a.branchId = :b', { b: q.branchId });
    if (ctx.accountIds) qb.andWhere('a.id IN (:...ids)', { ids: ctx.accountIds });
    return qb.orderBy('a.name', 'ASC').getMany();
  }

  /** Somme convertie de lignes { currency, total } */
  private async sumConverted(rows: Raw[], target: string, rates: RateCache): Promise<number> {
    let s = 0;
    for (const r of rows) s += (await rates.convert(Number(r.total || 0), r.currency, target)) ?? 0;
    return round2(s);
  }

  /** Mouvements validés (hors transferts) groupés : clé SQL + devise */
  private async flows(companyId: string, accountIds: string[], from: string, to: string, groupSql: string[], extraWhere = '') {
    if (!accountIds.length) return [] as Raw[];
    const groups = groupSql.map((g, i) => `${g} AS g${i}`).join(', ');
    return (await this.m.query(
      `SELECT ${groups}${groups ? ', ' : ''}t.currency AS currency, t.direction AS direction, SUM(t.amount) AS total, COUNT(*) AS n
         FROM bo_cash_transactions t
         LEFT JOIN bo_cash_categories c ON c.id = t.categoryId
        WHERE t.companyId = ? AND t.status = 'VALIDATED' AND t.transferId IS NULL
          AND t.accountId IN (${accountIds.map(() => '?').join(',')})
          AND t.transactionDate >= ? AND t.transactionDate <= ? ${extraWhere}
        GROUP BY ${[...groupSql.map((_, i) => `g${i}`), 'currency', 'direction'].join(', ')}`,
      [companyId, ...accountIds, from, to],
    )) as Raw[];
  }

  /** Solde total (converti) des comptes à une date */
  private async totalBalance(ctx: FinanceContext, accounts: CashAccount[], asOf: string | null, target: string, rates: RateCache) {
    if (!accounts.length) return { total: 0, byCurrency: {} as Record<string, number> };
    const balances = await this.access.balances(ctx.companyId, { accountIds: accounts.map((a) => a.id), asOf });
    const byCurrency: Record<string, number> = {};
    let total = 0;
    for (const a of accounts) {
      // Compte ouvert après la date : pas encore de solde
      if (asOf && a.openingDate && dateStr(a.openingDate)! > asOf) continue;
      const b = balances.get(a.id) ?? 0;
      byCurrency[a.currency] = round2((byCurrency[a.currency] ?? 0) + b);
      total += (await rates.convert(b, a.currency, target)) ?? 0;
    }
    return { total: round2(total), byCurrency };
  }

  // ============================================================
  // TABLEAU DE BORD
  // ============================================================

  async dashboard(q: CashReportQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, q.companyId, lang);
    const target = (q.currency || 'USD').toUpperCase();
    const { from, to } = this.period(q);
    const rates = new RateCache(this.m);
    const accounts = await this.accountsFor(ctx, q);
    const ids = accounts.map((a) => a.id);
    const accountsData = (await this.cash.listAccounts({ companyId: ctx.companyId, active: 'all', branchId: q.branchId } as any, user, lang, target)).data.filter(
      (a: any) => ids.includes(a.id),
    );

    const rows = await this.flows(ctx.companyId, ids, from, to, []);
    const inRows = rows.filter((r) => r.direction === CashDirection.IN);
    const outRows = rows.filter((r) => r.direction === CashDirection.OUT);
    const inflow = await this.sumConverted(inRows, target, rates);
    const outflow = await this.sumConverted(outRows, target, rates);

    // Période précédente de même durée (comparaison)
    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
    const prevTo = dayBefore(from);
    const prevFromD = new Date(from);
    prevFromD.setDate(prevFromD.getDate() - days);
    const prevFrom = dateStr(prevFromD)!;
    const prevRows = await this.flows(ctx.companyId, ids, prevFrom, prevTo, []);
    const prevIn = await this.sumConverted(prevRows.filter((r) => r.direction === 'IN'), target, rates);
    const prevOut = await this.sumConverted(prevRows.filter((r) => r.direction === 'OUT'), target, rates);

    // Rubriques principales de la période
    const byCat = await this.flows(ctx.companyId, ids, from, to, ['t.categoryId', "COALESCE(c.name, '')"]);
    const catTotals = new Map<string, { categoryId: string | null; name: string; direction: string; total: number }>();
    for (const r of byCat) {
      const key = `${r.g0 ?? 'none'}|${r.direction}`;
      const cur = catTotals.get(key) ?? { categoryId: r.g0 ?? null, name: r.g1 || this.t('cash_flow.uncategorized', lang), direction: r.direction, total: 0 };
      cur.total = round2(cur.total + ((await rates.convert(Number(r.total), r.currency, target)) ?? 0));
      catTotals.set(key, cur);
    }
    const cats = [...catTotals.values()];
    const top = (dir: string) =>
      cats
        .filter((c) => c.direction === dir)
        .sort((a, b) => b.total - a.total)
        .slice(0, 6)
        .map((c) => ({ ...c, share: (dir === 'IN' ? inflow : outflow) ? round2((c.total / (dir === 'IN' ? inflow : outflow)) * 100) : 0 }));

    // Évolution sur 12 mois
    const startPeriod = addMonths(to.slice(0, 7), -11);
    const monthly = await this.flows(ctx.companyId, ids, `${startPeriod}-01`, to, ["DATE_FORMAT(t.transactionDate, '%Y-%m')"]);
    const series: { period: string; inflow: number; outflow: number; net: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const p = addMonths(startPeriod, i);
      const pr = monthly.filter((r) => r.g0 === p);
      const pin = await this.sumConverted(pr.filter((r) => r.direction === 'IN'), target, rates);
      const pout = await this.sumConverted(pr.filter((r) => r.direction === 'OUT'), target, rates);
      series.push({ period: p, inflow: pin, outflow: pout, net: round2(pin - pout) });
    }

    // En attente
    const pending: Raw[] = ids.length
      ? await this.m.query(
        `SELECT currency, direction, SUM(amount) AS total, COUNT(*) AS n FROM bo_cash_transactions
          WHERE companyId = ? AND status = 'PENDING' AND accountId IN (${ids.map(() => '?').join(',')}) GROUP BY currency, direction`,
        [ctx.companyId, ...ids],
      )
      : [];

    const balance = await this.totalBalance(ctx, accounts.filter((a) => a.isActive), null, target, rates);
    const last = ids.length
      ? await this.m
        .createQueryBuilder(CashTransaction, 't')
        .leftJoinAndSelect('t.account', 'account')
        .leftJoinAndSelect('t.category', 'category')
        .leftJoinAndSelect('t.createdBy', 'createdBy')
        .where('t.companyId = :c AND t.accountId IN (:...ids)', { c: ctx.companyId, ids })
        .orderBy('t.createdAt', 'DESC')
        .take(10)
        .getMany()
      : [];

    const pct = (a: number, b: number) => (b ? round2(((a - b) / Math.abs(b)) * 100) : null);
    return {
      message: this.t('cash_flow.dashboard', lang),
      data: {
        period: { from, to },
        currency: target,
        balance: { total: balance.total, byCurrency: balance.byCurrency },
        inflow,
        outflow,
        net: round2(inflow - outflow),
        byCurrency: [...new Set(rows.map((r) => r.currency))].map((cur) => {
          const i = Number(inRows.find((r) => r.currency === cur)?.total || 0);
          const o = Number(outRows.find((r) => r.currency === cur)?.total || 0);
          return { currency: cur, inflow: round2(i), outflow: round2(o), net: round2(i - o) };
        }),
        previous: { from: prevFrom, to: prevTo, inflow: prevIn, outflow: prevOut, net: round2(prevIn - prevOut) },
        evolution: { inflow: pct(inflow, prevIn), outflow: pct(outflow, prevOut) },
        /** Nombre moyen de jours de sorties couverts par le solde (au rythme de la période) */
        runwayDays: outflow > 0 ? Math.floor(balance.total / (outflow / days)) : null,
        pending: {
          count: pending.reduce((s, p: any) => s + Number(p.n || 0), 0),
          inflow: await this.sumConverted(pending.filter((p) => p.direction === 'IN'), target, rates),
          outflow: await this.sumConverted(pending.filter((p) => p.direction === 'OUT'), target, rates),
        },
        accounts: accountsData,
        alerts: accountsData
          .filter((a: any) => a.isActive && (a.lowBalance || a.balance < 0))
          .map((a: any) => ({ accountId: a.id, name: a.name, balance: a.balance, minBalance: a.minBalance, currency: a.currency, negative: a.balance < 0 })),
        topInflows: top('IN'),
        topOutflows: top('OUT'),
        monthly: series,
        lastTransactions: last.map((t) => this.cash.serializeTx(t)),
        missingRates: [...rates.missing],
      },
    };
  }

  // ============================================================
  // TABLEAU DES FLUX DE TRÉSORERIE
  // ============================================================

  async statement(q: CashReportQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, q.companyId, lang);
    const target = (q.currency || 'USD').toUpperCase();
    const { from, to } = this.period(q);
    const groupBy = q.groupBy ?? 'month';
    const rates = new RateCache(this.m);
    const accounts = await this.accountsFor(ctx, q);
    const ids = accounts.map((a) => a.id);

    const opening = await this.totalBalance(ctx, accounts, dayBefore(from), target, rates);
    const closing = await this.totalBalance(ctx, accounts, to, target, rates);

    const cats = await this.m.find(CashCategory, { where: { companyId: ctx.companyId } });
    const catById = new Map<string, CashCategory>(cats.map((c: CashCategory) => [c.id, c] as [string, CashCategory]));
    const rows = await this.flows(ctx.companyId, ids, from, to, ['t.categoryId']);

    // Sections : activité → entrées / sorties → rubriques (sous-rubriques regroupées sous leur parent)
    type Line = { categoryId: string | null; name: string; total: number; children: { categoryId: string; name: string; total: number }[] };
    const sections = ACTIVITY_ORDER.map((activity) => ({ activity, label: this.t(`cash_flow.activity.${activity}`, lang), inflows: [] as Line[], outflows: [] as Line[], inflow: 0, outflow: 0, net: 0 }));
    for (const r of rows) {
      const cat = r.g0 ? catById.get(r.g0) : undefined;
      const activity = (cat?.activity as CashActivity) ?? CashActivity.OPERATING;
      const section = sections.find((s) => s.activity === activity)!;
      const amount = (await rates.convert(Number(r.total), r.currency, target)) ?? 0;
      const parent = cat?.parentId ? catById.get(cat.parentId) : undefined;
      const head = parent ?? cat;
      const list = r.direction === 'IN' ? section.inflows : section.outflows;
      const key = head?.id ?? null;
      let line = list.find((l) => l.categoryId === key);
      if (!line) {
        line = { categoryId: key, name: head?.name ?? this.t('cash_flow.uncategorized', lang), total: 0, children: [] };
        list.push(line);
      }
      line.total = round2(line.total + amount);
      if (parent && cat) {
        let child = line.children.find((c) => c.categoryId === cat.id);
        if (!child) {
          child = { categoryId: cat.id, name: cat.name, total: 0 };
          line.children.push(child);
        }
        child.total = round2(child.total + amount);
      }
      if (r.direction === 'IN') section.inflow = round2(section.inflow + amount);
      else section.outflow = round2(section.outflow + amount);
    }
    for (const s of sections) {
      s.net = round2(s.inflow - s.outflow);
      s.inflows.sort((a, b) => b.total - a.total);
      s.outflows.sort((a, b) => b.total - a.total);
    }
    const inflow = round2(sections.reduce((s, x) => s + x.inflow, 0));
    const outflow = round2(sections.reduce((s, x) => s + x.outflow, 0));

    // Détail par période
    const fmt = GROUP_FORMAT[groupBy];
    const byPeriod = await this.flows(ctx.companyId, ids, from, to, [`DATE_FORMAT(t.transactionDate, '${fmt}')`]);
    const periods = [...new Set(byPeriod.map((r) => String(r.g0)))].sort();
    let running = opening.total;
    const series: { period: string; inflow: number; outflow: number; net: number; closingBalance: number }[] = [];
    for (const p of periods) {
      const pr = byPeriod.filter((r) => String(r.g0) === p);
      const pin = await this.sumConverted(pr.filter((r) => r.direction === 'IN'), target, rates);
      const pout = await this.sumConverted(pr.filter((r) => r.direction === 'OUT'), target, rates);
      running = round2(running + pin - pout);
      series.push({ period: p, inflow: pin, outflow: pout, net: round2(pin - pout), closingBalance: running });
    }

    // Écart dû au change / aux transferts entre devises (la clôture réelle fait foi)
    const conversionGap = round2(closing.total - (opening.total + inflow - outflow));
    return {
      message: this.t('cash_flow.statement', lang),
      data: {
        period: { from, to, groupBy },
        currency: target,
        openingBalance: opening.total,
        openingByCurrency: opening.byCurrency,
        sections,
        inflow,
        outflow,
        netChange: round2(inflow - outflow),
        closingBalance: closing.total,
        closingByCurrency: closing.byCurrency,
        conversionGap,
        series,
        missingRates: [...rates.missing],
      },
    };
  }

  // ============================================================
  // PRÉVISIONS VS RÉEL
  // ============================================================

  async forecastVsActual(q: ForecastVsActualQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, q.companyId, lang);
    const target = (q.currency || 'USD').toUpperCase();
    const year = q.year ?? new Date().getFullYear();
    const rates = new RateCache(this.m);
    const accounts = await this.accountsFor(ctx, {});
    const ids = accounts.map((a) => a.id);
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

    const cats = await this.m.find(CashCategory, { where: { companyId: ctx.companyId }, order: { direction: 'ASC', position: 'ASC', name: 'ASC' } });
    const forecasts: { categoryId: string; period: string; amount: string; currency: string }[] = await this.m.query(
      'SELECT categoryId, period, amount, currency FROM bo_cash_forecasts WHERE companyId = ? AND period >= ? AND period <= ?',
      [ctx.companyId, months[0], months[11]],
    );
    const actual = await this.flows(ctx.companyId, ids, `${year}-01-01`, `${year}-12-31`, ['t.categoryId', "DATE_FORMAT(t.transactionDate, '%Y-%m')"]);

    const lines: any[] = [];
    for (const cat of cats) {
      const f = forecasts.filter((x) => x.categoryId === cat.id);
      const a = actual.filter((x) => x.g0 === cat.id && x.direction === cat.direction);
      if (!f.length && !a.length && !cat.isActive) continue;
      const monthsData: any[] = [];
      let planned = 0;
      let real = 0;
      for (const p of months) {
        let fp = 0;
        for (const x of f.filter((x) => x.period === p)) fp += (await rates.convert(Number(x.amount), x.currency, target)) ?? 0;
        const ap = await this.sumConverted(a.filter((x) => x.g1 === p), target, rates);
        planned += fp;
        real += ap;
        monthsData.push({ period: p, planned: round2(fp), actual: ap, variance: round2(ap - fp), rate: fp ? round2((ap / fp) * 100) : null });
      }
      if (!planned && !real) continue;
      lines.push({
        categoryId: cat.id,
        name: cat.name,
        direction: cat.direction,
        activity: cat.activity,
        parentId: cat.parentId ?? null,
        planned: round2(planned),
        actual: round2(real),
        variance: round2(real - planned),
        rate: planned ? round2((real / planned) * 100) : null,
        // Sortie au-delà du budget / entrée sous la prévision
        alert: cat.direction === CashDirection.OUT ? real > planned && planned > 0 : planned > 0 && real < planned,
        months: monthsData,
      });
    }
    const totals = (dir: string) => {
      const l = lines.filter((x) => x.direction === dir);
      return { planned: round2(l.reduce((s, x) => s + x.planned, 0)), actual: round2(l.reduce((s, x) => s + x.actual, 0)) };
    };
    const tin = totals('IN');
    const tout = totals('OUT');
    return {
      message: this.t('cash_flow.forecast_vs_actual', lang),
      data: {
        year,
        currency: target,
        inflow: tin,
        outflow: tout,
        net: { planned: round2(tin.planned - tout.planned), actual: round2(tin.actual - tout.actual) },
        lines,
        missingRates: [...rates.missing],
      },
    };
  }

  // ============================================================
  // PROJECTION DU SOLDE
  // ============================================================

  async projection(q: ProjectionQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, q.companyId, lang);
    const target = (q.currency || 'USD').toUpperCase();
    const months = q.months ?? 6;
    const rates = new RateCache(this.m);
    const accounts = (await this.accountsFor(ctx, {})).filter((a) => a.isActive);
    const ids = accounts.map((a) => a.id);
    const now = today();
    const current = await this.totalBalance(ctx, accounts, null, target, rates);
    const thisMonth = now.slice(0, 7);

    // Moyenne des 3 derniers mois complets (si aucune prévision n'est saisie pour un mois)
    const avgFrom = `${addMonths(thisMonth, -3)}-01`;
    const avgTo = dayBefore(`${thisMonth}-01`);
    const avgRows = await this.flows(ctx.companyId, ids, avgFrom, avgTo, []);
    const avgIn = round2((await this.sumConverted(avgRows.filter((r) => r.direction === 'IN'), target, rates)) / 3);
    const avgOut = round2((await this.sumConverted(avgRows.filter((r) => r.direction === 'OUT'), target, rates)) / 3);

    const lastPeriod = addMonths(thisMonth, months - 1);
    const forecasts: { direction: string; period: string; amount: string; currency: string }[] = await this.m.query(
      `SELECT c.direction, f.period, f.amount, f.currency FROM bo_cash_forecasts f
         JOIN bo_cash_categories c ON c.id = f.categoryId
        WHERE f.companyId = ? AND f.period >= ? AND f.period <= ?`,
      [ctx.companyId, thisMonth, lastPeriod],
    );
    // Mois en cours : déjà réalisé (pour ne compter que le reste de la prévision)
    const doneRows = await this.flows(ctx.companyId, ids, `${thisMonth}-01`, now, []);
    const doneIn = await this.sumConverted(doneRows.filter((r) => r.direction === 'IN'), target, rates);
    const doneOut = await this.sumConverted(doneRows.filter((r) => r.direction === 'OUT'), target, rates);

    // Mouvements en attente : comptés dans le mois en cours
    const pending: Raw[] = ids.length
      ? await this.m.query(
        `SELECT currency, direction, SUM(amount) AS total FROM bo_cash_transactions
          WHERE companyId = ? AND status = 'PENDING' AND accountId IN (${ids.map(() => '?').join(',')}) GROUP BY currency, direction`,
        [ctx.companyId, ...ids],
      )
      : [];
    const pendIn = await this.sumConverted(pending.filter((p) => p.direction === 'IN'), target, rates);
    const pendOut = await this.sumConverted(pending.filter((p) => p.direction === 'OUT'), target, rates);

    let balance = current.total;
    const rows: any[] = [];
    for (let i = 0; i < months; i++) {
      const p = addMonths(thisMonth, i);
      const f = forecasts.filter((x) => x.period === p);
      let fin = 0;
      let fout = 0;
      for (const x of f) {
        const v = (await rates.convert(Number(x.amount), x.currency, target)) ?? 0;
        if (x.direction === 'IN') fin += v;
        else fout += v;
      }
      const source = f.length ? 'FORECAST' : 'AVERAGE';
      let pin = f.length ? round2(fin) : avgIn;
      let pout = f.length ? round2(fout) : avgOut;
      if (i === 0) {
        // Reste à venir ce mois-ci (prévision − déjà réalisé) + mouvements en attente
        pin = round2(Math.max(0, pin - doneIn) + pendIn);
        pout = round2(Math.max(0, pout - doneOut) + pendOut);
      }
      const opening = balance;
      balance = round2(balance + pin - pout);
      rows.push({ period: p, source, openingBalance: opening, inflow: pin, outflow: pout, net: round2(pin - pout), closingBalance: balance, negative: balance < 0 });
    }
    const firstNegative = rows.find((r) => r.negative);
    return {
      message: this.t('cash_flow.projection', lang),
      data: {
        currency: target,
        currentBalance: current.total,
        currentByCurrency: current.byCurrency,
        averages: { from: avgFrom, to: avgTo, inflow: avgIn, outflow: avgOut },
        pending: { inflow: pendIn, outflow: pendOut },
        months: rows,
        /** Premier mois où le solde prévu devient négatif */
        shortfallPeriod: firstNegative?.period ?? null,
        missingRates: [...rates.missing],
      },
    };
  }

  // ============================================================
  // GRAND LIVRE D'UN COMPTE
  // ============================================================

  async ledger(accountId: string, q: LedgerQueryDto, user: UserEntity, lang: string) {
    const acc = await this.m.findOne(CashAccount, { where: { id: accountId } });
    if (!acc) throw new NotFoundException(this.t('cash_flow.account_not_found', lang));
    const ctx = await this.access.context(user, acc.companyId, lang);
    this.access.assertAccountAllowed(ctx, acc.id, lang);
    const { from, to } = this.period(q);
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(q.limit) || 100));

    const opening = await this.access.balanceOf(acc.companyId, acc.id, dayBefore(from));
    const qb = this.m
      .createQueryBuilder(CashTransaction, 't')
      .leftJoinAndSelect('t.category', 'category')
      .leftJoinAndSelect('t.createdBy', 'createdBy')
      .where('t.accountId = :id AND t.status = :st', { id: acc.id, st: CashTransactionStatus.VALIDATED })
      .andWhere('t.transactionDate >= :from AND t.transactionDate <= :to', { from, to })
      .orderBy('t.transactionDate', 'ASC')
      .addOrderBy('t.createdAt', 'ASC');
    const total = await qb.getCount();

    // Solde au début de la page = ouverture + mouvements des pages précédentes
    let running = opening;
    if (page > 1) {
      const before: { net: string }[] = await this.m.query(
        `SELECT SUM(CASE WHEN x.direction = 'IN' THEN x.amount ELSE -x.amount END) AS net FROM (
           SELECT direction, amount FROM bo_cash_transactions
            WHERE accountId = ? AND status = 'VALIDATED' AND transactionDate >= ? AND transactionDate <= ?
            ORDER BY transactionDate ASC, createdAt ASC LIMIT ?) x`,
        [acc.id, from, to, (page - 1) * limit],
      );
      running = round2(running + Number(before?.[0]?.net || 0));
    }
    const rows = await qb.skip((page - 1) * limit).take(limit).getMany();
    const lines = rows.map((t) => {
      running = round2(running + (t.direction === CashDirection.IN ? Number(t.amount) : -Number(t.amount)));
      return { ...this.cash.serializeTx(t), debit: t.direction === 'IN' ? Number(t.amount) : 0, credit: t.direction === 'OUT' ? Number(t.amount) : 0, balance: running };
    });
    const totals: { inflow: string; outflow: string }[] = await this.m.query(
      `SELECT SUM(CASE WHEN direction = 'IN' THEN amount ELSE 0 END) AS inflow, SUM(CASE WHEN direction = 'OUT' THEN amount ELSE 0 END) AS outflow
         FROM bo_cash_transactions WHERE accountId = ? AND status = 'VALIDATED' AND transactionDate >= ? AND transactionDate <= ?`,
      [acc.id, from, to],
    );
    const inflow = round2(Number(totals?.[0]?.inflow || 0));
    const outflow = round2(Number(totals?.[0]?.outflow || 0));
    return {
      message: this.t('cash_flow.ledger', lang),
      data: {
        account: { id: acc.id, name: acc.name, type: acc.type, currency: acc.currency },
        period: { from, to },
        openingBalance: opening,
        inflow,
        outflow,
        closingBalance: round2(opening + inflow - outflow),
        lines,
      },
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================================
  // EXPORT CSV
  // ============================================================

  async exportCsv(q: CashTransactionQueryDto, user: UserEntity, lang: string): Promise<{ filename: string; content: string }> {
    const ctx = await this.access.context(user, q.companyId, lang);
    const qb = this.m
      .createQueryBuilder(CashTransaction, 't')
      .leftJoinAndSelect('t.account', 'account')
      .leftJoinAndSelect('t.category', 'category')
      .leftJoinAndSelect('t.createdBy', 'createdBy');
    this.cash.applyTxFilters(qb, ctx, q);
    const rows = await qb.orderBy('t.transactionDate', 'ASC').addOrderBy('t.createdAt', 'ASC').take(50000).getMany();
    const head = ['date', 'reference', 'account', 'direction', 'category', 'amount', 'currency', 'status', 'payment_method', 'counterparty', 'document', 'description', 'created_by'].map(
      (k) => this.t(`cash_flow.csv.${k}`, lang),
    );
    const esc = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((t) =>
      [
        dateStr(t.transactionDate),
        t.reference,
        t.account?.name ?? '',
        this.t(`cash_flow.direction.${t.direction}`, lang),
        t.category?.name ?? (t.transferId ? this.t('cash_flow.internal_transfer', lang) : ''),
        Number(t.amount).toFixed(2).replace('.', ','),
        t.currency,
        this.t(`cash_flow.status.${t.status}`, lang),
        t.paymentMethod ?? '',
        t.counterpartyName ?? '',
        t.documentNumber ?? '',
        t.description ?? '',
        t.createdBy?.fullName ?? '',
      ]
        .map(esc)
        .join(';'),
    );
    // BOM UTF-8 + séparateur « ; » : s'ouvre directement dans Excel (accents corrects)
    const content = '﻿' + [head.join(';'), ...lines].join('\r\n');
    return { filename: `tresorerie_${q.from ?? 'debut'}_${q.to ?? today()}.csv`, content };
  }
}
