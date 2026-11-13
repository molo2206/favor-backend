import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { RoomAvailability } from 'src/HotelRoomAvailability/entity/RoomAvailability.entity';
import { I18nService } from 'src/libs/common/src';

/** Période demandée + période précédente de même durée (comparaison) */
interface Period {
  from: Date;
  to: Date; // exclu
  prevFrom: Date;
  prevTo: Date;
  days: number;
}

interface CompanyRow {
  id: string;
  companyName: string | null;
  typeCompany: CompanyType;
  logo: string | null;
  status: string | null;
  cityId: string | null;
  cityName: string | null;
}

type Money = Record<string, number>;

/** Types qui vendent par commandes (orders / sub_orders) */
const ORDER_TYPES: string[] = [CompanyType.RESTAURANT, CompanyType.SHOP, CompanyType.GROCERY, CompanyType.CAR, CompanyType.SERVICE];
/** Types logistiques (colis / LTA) */
const LOGISTIC_TYPES: string[] = [CompanyType.SHIPPING, CompanyType.LOGISTIC_AGENCY, CompanyType.AGENCE];

/**
 * ✅ TABLEAU DE BORD DE L'ENTREPRISE ACTIVE — contenu adapté au type d'entreprise
 *
 *   RESTAURANT / SHOP / GROCERY / CAR / SERVICE → commandes, chiffre d'affaires, paiements, produits, clients,
 *                                                livraisons (+ disponibilité des plats pour RESTAURANT,
 *                                                stock pour SHOP / GROCERY, services pour SERVICE)
 *   HOTEL                                       → réservations, nuitées, occupation, chambres, arrivées
 *   TRANSPORT_AGENCY                            → voyages, véhicules, réservations, places vendues, paiements
 *   SHIPPING / LOGISTIC_AGENCY / AGENCE         → colis (enlèvement / expédition / livraison), LTA, routes
 *   TAXI                                        → courses, revenus, commissions, chauffeurs
 *   + pour tous : entreprise, équipe, frais / transactions de l'entreprise, alertes
 *
 * Chaque bloc est calculé séparément : si un bloc échoue, il vaut null et les autres sont quand même renvoyés
 * (la liste `warnings` indique le bloc en erreur).
 */
@Injectable()
export class CompanyDashboardService {
  private readonly logger = new Logger(CompanyDashboardService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) { }

  // ============================================================
  // OUTILS
  // ============================================================
  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params) as any;
  }

  private q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.dataSource.query(sql, params);
  }

  private n(v: any): number {
    const x = Number(v);
    return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
  }

  private int(v: any): number {
    const x = parseInt(String(v ?? 0), 10);
    return Number.isFinite(x) ? x : 0;
  }

  /** Lignes { currency, value } → { USD: 10, CDF: 20000 } */
  private money(rows: any[], key = 'amount', currencyKey = 'currency'): Money {
    const out: Money = {};
    for (const r of rows || []) {
      const c = String(r?.[currencyKey] || 'N/A');
      out[c] = this.n((out[c] || 0) + Number(r?.[key] || 0));
    }
    return out;
  }

  /** Variation en % (null si pas de référence) */
  private change(current: number, previous: number): number | null {
    if (!previous) return current ? 100 : null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  private moneyChange(current: Money, previous: Money): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const c of new Set([...Object.keys(current), ...Object.keys(previous)])) {
      out[c] = this.change(current[c] || 0, previous[c] || 0);
    }
    return out;
  }

  private rate(part: number, total: number): number {
    return total ? Math.round((part / total) * 1000) / 10 : 0;
  }

  /** { STATUS: count } */
  private countMap(rows: any[], key = 'status', valueKey = 'count'): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of rows || []) out[String(r?.[key] ?? 'N/A')] = this.int(r?.[valueKey]);
    return out;
  }

  private kpi(key: string, value: number | Money, previous?: number | Money | null, unit?: string) {
    const isMoney = typeof value === 'object';
    return {
      key,
      value,
      previous: previous ?? null,
      change:
        previous == null
          ? null
          : isMoney
            ? this.moneyChange(value as Money, (previous as Money) || {})
            : this.change(value as number, (previous as number) || 0),
      unit: unit ?? (isMoney ? 'money' : 'count'),
    };
  }

  /** Exécute un bloc ; en cas d'erreur : null + avertissement (le reste du tableau de bord est renvoyé) */
  private async safe<T>(name: string, warnings: string[], fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (e: any) {
      this.logger.warn(`Dashboard bloc « ${name} » : ${e?.message}`);
      warnings.push(name);
      return null;
    }
  }

  private period(startDate?: string, endDate?: string): Period {
    const day = 24 * 3600 * 1000;
    const parse = (s?: string) => {
      if (!s) return null;
      const d = new Date(String(s).length <= 10 ? `${s}T00:00:00` : s);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let to = parse(endDate);
    let from = parse(startDate);
    to = to ? new Date(to.getTime() + (String(endDate).length <= 10 ? day : 0)) : new Date(today.getTime() + day);
    from = from ?? new Date(to.getTime() - 30 * day);
    if (from >= to) from = new Date(to.getTime() - day);
    // Limite : 2 ans maximum
    if (to.getTime() - from.getTime() > 731 * day) from = new Date(to.getTime() - 731 * day);
    const length = to.getTime() - from.getTime();
    return {
      from,
      to,
      prevFrom: new Date(from.getTime() - length),
      prevTo: from,
      days: Math.round(length / day),
    };
  }

  // ============================================================
  // POINT D'ENTRÉE
  // ============================================================
  async dashboard(user: UserEntity, query: { startDate?: string; endDate?: string; companyId?: string }, lang = 'fr') {
    const company = await this.resolveCompany(user, query.companyId, lang);
    const p = this.period(query.startDate, query.endDate);
    const warnings: string[] = [];
    const type = String(company.typeCompany || '').toUpperCase();

    let sections: Record<string, any>;
    let family: string;
    if (ORDER_TYPES.includes(type)) {
      family = 'ORDERS';
      sections = await this.orderDashboard(company, p, warnings);
    } else if (type === CompanyType.HOTEL) {
      family = 'HOTEL';
      sections = await this.hotelDashboard(company, p, warnings);
    } else if (type === CompanyType.TRANSPORT_AGENCY) {
      family = 'TRANSPORT';
      sections = await this.transportDashboard(company, p, warnings);
    } else if (LOGISTIC_TYPES.includes(type)) {
      family = 'LOGISTICS';
      sections = await this.logisticsDashboard(company, p, warnings);
    } else if (type === CompanyType.TAXI) {
      family = 'TAXI';
      sections = await this.taxiDashboard(company, p, warnings);
    } else {
      family = 'ORDERS';
      sections = await this.orderDashboard(company, p, warnings);
    }

    const [team, finance] = await Promise.all([
      this.safe('team', warnings, () => this.team(company)),
      this.safe('finance', warnings, () => this.finance(company, p)),
    ]);

    return {
      message: this.t('dashboard.data_fetched_success', lang),
      data: {
        company: {
          id: company.id,
          name: company.companyName,
          type: company.typeCompany,
          logo: company.logo,
          status: company.status,
          city: company.cityName,
        },
        family,
        period: {
          from: p.from,
          to: new Date(p.to.getTime() - 1),
          days: p.days,
          previousFrom: p.prevFrom,
          previousTo: new Date(p.prevTo.getTime() - 1),
        },
        ...sections,
        team,
        finance,
        generatedAt: new Date(),
        warnings,
      },
    };
  }

  /** Entreprise active de l'utilisateur (un super admin peut en demander une autre avec companyId) */
  private async resolveCompany(user: UserEntity, companyId: string | undefined, lang: string): Promise<CompanyRow> {
    const isSuper = user?.role === UserRole.SUPER_ADMIN;
    const id = isSuper && companyId ? companyId : user?.activeCompanyId;
    if (!id) throw new ForbiddenException(this.t('dashboard.no_active_company', lang));

    if (!isSuper) {
      const link = await this.q('SELECT 1 FROM user_has_company WHERE userId = ? AND companyId = ? LIMIT 1', [user.id, id]);
      if (!link.length) throw new ForbiddenException(this.t('dashboard.company_forbidden', lang));
    }
    const rows = await this.q<CompanyRow>(
      `SELECT c.id, c.companyName, c.typeCompany, c.logo, c.status, c.cityId, ci.name AS cityName
         FROM company c LEFT JOIN cities ci ON ci.id = c.cityId
        WHERE c.id = ? LIMIT 1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(this.t('dashboard.company_not_found', lang));
    return rows[0];
  }

  // ============================================================
  // COMMUN : ÉQUIPE + FINANCES
  // ============================================================
  private async team(c: CompanyRow) {
    const [members, branches] = await Promise.all([
      this.q(
        `SELECT COUNT(*) AS total, SUM(uhc.isOwner = 1) AS owners
           FROM user_has_company uhc WHERE uhc.companyId = ?`,
        [c.id],
      ),
      this.q('SELECT COUNT(*) AS total FROM branches WHERE company_id = ?', [c.id]).catch(() => [{ total: 0 }]),
    ]);
    return {
      members: this.int(members[0]?.total),
      owners: this.int(members[0]?.owners),
      branches: this.int(branches[0]?.total),
    };
  }

  /** Frais / transactions de l'entreprise (company_transactions) */
  private async finance(c: CompanyRow, p: Period) {
    const rows = await this.q(
      `SELECT type, status, paid, COUNT(*) AS count, SUM(amount) AS amount
         FROM company_transactions
        WHERE companyId = ? AND createdAt >= ? AND createdAt < ?
        GROUP BY type, status, paid`,
      [c.id, p.from, p.to],
    );
    const unpaid = await this.q(
      'SELECT COUNT(*) AS count, SUM(amount) AS amount FROM company_transactions WHERE companyId = ? AND paid = 0',
      [c.id],
    );
    const byType: Record<string, { count: number; amount: number }> = {};
    for (const r of rows) {
      const k = String(r.type ?? 'N/A');
      byType[k] = { count: (byType[k]?.count || 0) + this.int(r.count), amount: this.n((byType[k]?.amount || 0) + Number(r.amount || 0)) };
    }
    return {
      transactions: rows.reduce((s, r) => s + this.int(r.count), 0),
      totalAmount: this.n(rows.reduce((s, r) => s + Number(r.amount || 0), 0)),
      byType,
      byStatus: rows.reduce((acc: Record<string, number>, r) => {
        const k = String(r.status ?? 'N/A');
        acc[k] = (acc[k] || 0) + this.int(r.count);
        return acc;
      }, {}),
      unpaid: { count: this.int(unpaid[0]?.count), amount: this.n(unpaid[0]?.amount) },
    };
  }

  /** Série complète jour par jour (les jours sans activité valent 0) */
  private fillDays<T extends { date: string }>(p: Period, rows: T[], empty: () => Omit<T, 'date'>): T[] {
    const map = new Map(rows.map((r) => [String(r.date).slice(0, 10), r]));
    const out: T[] = [];
    if (p.days > 400) return rows; // très longue période : seulement les jours actifs
    for (let d = new Date(p.from); d < p.to; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push(map.get(key) ?? ({ date: key, ...empty() } as T));
    }
    return out;
  }

  private dateKey(v: any): string {
    if (v instanceof Date) {
      return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    }
    return String(v).slice(0, 10);
  }

  // ============================================================
  // 1. COMMANDES : RESTAURANT / SHOP / GROCERY / CAR / SERVICE
  // ============================================================
  /**
   * Chiffre d'affaires de l'entreprise = sous-commandes (sub_orders) de CETTE entreprise
   * (une commande peut contenir plusieurs boutiques). Commandes rejetées / annulées exclues.
   */
  private async orderDashboard(c: CompanyRow, p: Period, w: string[]) {
    const type = String(c.typeCompany);
    const base = `FROM sub_orders so JOIN orders o ON o.id = so.orderId WHERE so.companyId = ?`;
    const valid = `o.status <> 'REJECTED' AND o.cancelledAt IS NULL`;

    const totals = async (from: Date, to: Date) => {
      const [counts, revenue, customers] = await Promise.all([
        this.q(
          `SELECT COUNT(DISTINCT o.id) AS orders,
                  COUNT(DISTINCT CASE WHEN o.status = 'DELIVERED' THEN o.id END) AS delivered,
                  COUNT(DISTINCT CASE WHEN o.status = 'PENDING' AND o.cancelledAt IS NULL THEN o.id END) AS pending,
                  COUNT(DISTINCT CASE WHEN o.status IN ('VALIDATED','PROCESSING','COMPLETED') AND o.cancelledAt IS NULL THEN o.id END) AS inProgress,
                  COUNT(DISTINCT CASE WHEN o.status = 'REJECTED' OR o.cancelledAt IS NOT NULL THEN o.id END) AS cancelled
             ${base} AND o.createdAt >= ? AND o.createdAt < ?`,
          [c.id, from, to],
        ),
        this.q(
          `SELECT o.currency AS currency, SUM(so.totalAmount) AS amount,
                  SUM(CASE WHEN o.paid = 1 THEN so.totalAmount ELSE 0 END) AS paid,
                  COUNT(DISTINCT o.id) AS orders
             ${base} AND o.createdAt >= ? AND o.createdAt < ? AND ${valid}
            GROUP BY o.currency`,
          [c.id, from, to],
        ),
        this.q(`SELECT COUNT(DISTINCT o.userId) AS customers ${base} AND o.createdAt >= ? AND o.createdAt < ? AND ${valid}`, [
          c.id,
          from,
          to,
        ]),
      ]);
      const avgBasket: Money = {};
      for (const r of revenue) avgBasket[String(r.currency || 'N/A')] = this.n(Number(r.amount || 0) / Math.max(1, this.int(r.orders)));
      return {
        orders: this.int(counts[0]?.orders),
        delivered: this.int(counts[0]?.delivered),
        pending: this.int(counts[0]?.pending),
        inProgress: this.int(counts[0]?.inProgress),
        cancelled: this.int(counts[0]?.cancelled),
        revenue: this.money(revenue, 'amount'),
        paidRevenue: this.money(revenue, 'paid'),
        avgBasket,
        customers: this.int(customers[0]?.customers),
      };
    };

    const [cur, prev] = await Promise.all([totals(p.from, p.to), totals(p.prevFrom, p.prevTo)]);

    const newCustomers = await this.safe('orders.newCustomers', w, async () => {
      const r = await this.q(
        `SELECT COUNT(*) AS total FROM (
            SELECT o.userId, MIN(o.createdAt) AS firstOrder ${base} AND ${valid} GROUP BY o.userId
         ) f WHERE f.firstOrder >= ? AND f.firstOrder < ?`,
        [c.id, p.from, p.to],
      );
      return this.int(r[0]?.total);
    });

    const kpis = [
      this.kpi('orders', cur.orders, prev.orders),
      this.kpi('revenue', cur.revenue, prev.revenue),
      this.kpi('paidRevenue', cur.paidRevenue, prev.paidRevenue),
      this.kpi('avgBasket', cur.avgBasket, prev.avgBasket),
      this.kpi('delivered', cur.delivered, prev.delivered),
      this.kpi('cancelled', cur.cancelled, prev.cancelled),
      this.kpi('customers', cur.customers, prev.customers),
      this.kpi('newCustomers', newCustomers ?? 0, null),
      { key: 'deliveryRate', value: this.rate(cur.delivered, cur.orders), previous: this.rate(prev.delivered, prev.orders), change: null, unit: 'percent' },
      { key: 'cancellationRate', value: this.rate(cur.cancelled, cur.orders), previous: this.rate(prev.cancelled, prev.orders), change: null, unit: 'percent' },
    ];

    const [byStatus, payments, timeline, byHour, byWeekday, topProducts, topCustomers, catalog, delivery] = await Promise.all([
      this.safe('orders.byStatus', w, async () =>
        this.countMap(await this.q(`SELECT o.status AS status, COUNT(DISTINCT o.id) AS count ${base} AND o.createdAt >= ? AND o.createdAt < ? GROUP BY o.status`, [c.id, p.from, p.to])),
      ),
      this.safe('orders.payments', w, async () => {
        const rows = await this.q(
          `SELECT COALESCE(o.paymentMethod, 'N/A') AS method, o.paymentStatus AS paymentStatus, o.currency AS currency,
                  COUNT(DISTINCT o.id) AS count, SUM(so.totalAmount) AS amount
             ${base} AND o.createdAt >= ? AND o.createdAt < ? AND ${valid}
            GROUP BY o.paymentMethod, o.paymentStatus, o.currency`,
          [c.id, p.from, p.to],
        );
        const byMethod: Record<string, { count: number; amount: Money }> = {};
        const byPaymentStatus: Record<string, { count: number; amount: Money }> = {};
        for (const r of rows) {
          for (const [map, k] of [[byMethod, r.method], [byPaymentStatus, r.paymentStatus]] as const) {
            const key = String(k ?? 'N/A');
            const e = (map[key] = map[key] ?? { count: 0, amount: {} });
            e.count += this.int(r.count);
            const cur2 = String(r.currency || 'N/A');
            e.amount[cur2] = this.n((e.amount[cur2] || 0) + Number(r.amount || 0));
          }
        }
        return { byMethod, byPaymentStatus };
      }),
      this.safe('orders.timeline', w, async () => {
        const rows = await this.q(
          `SELECT DATE(o.createdAt) AS date, o.currency AS currency, COUNT(DISTINCT o.id) AS orders, SUM(so.totalAmount) AS amount
             ${base} AND o.createdAt >= ? AND o.createdAt < ? AND ${valid}
            GROUP BY DATE(o.createdAt), o.currency ORDER BY date`,
          [c.id, p.from, p.to],
        );
        const map = new Map<string, { date: string; orders: number; revenue: Money }>();
        for (const r of rows) {
          const d = this.dateKey(r.date);
          const e = map.get(d) ?? { date: d, orders: 0, revenue: {} };
          e.orders += this.int(r.orders);
          e.revenue[String(r.currency || 'N/A')] = this.n(r.amount);
          map.set(d, e);
        }
        return this.fillDays(p, [...map.values()], () => ({ orders: 0, revenue: {} }));
      }),
      this.safe('orders.byHour', w, async () => {
        const rows = await this.q(`SELECT HOUR(o.createdAt) AS hour, COUNT(DISTINCT o.id) AS count ${base} AND o.createdAt >= ? AND o.createdAt < ? AND ${valid} GROUP BY HOUR(o.createdAt)`, [c.id, p.from, p.to]);
        const m = new Map(rows.map((r) => [this.int(r.hour), this.int(r.count)]));
        return Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: m.get(h) ?? 0 }));
      }),
      this.safe('orders.byWeekday', w, async () => {
        const rows = await this.q(`SELECT DAYOFWEEK(o.createdAt) AS d, COUNT(DISTINCT o.id) AS count ${base} AND o.createdAt >= ? AND o.createdAt < ? AND ${valid} GROUP BY DAYOFWEEK(o.createdAt)`, [c.id, p.from, p.to]);
        const m = new Map(rows.map((r) => [this.int(r.d), this.int(r.count)]));
        // 1 = dimanche … 7 = samedi (MySQL)
        return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].map((day, i) => ({ day, orders: m.get(i + 1) ?? 0 }));
      }),
      this.safe('orders.topProducts', w, async () => {
        const rows = await this.q(
          `SELECT p.id AS productId, p.name AS name, p.image AS image, o.currency AS currency,
                  SUM(oi.quantity) AS quantity, SUM(oi.quantity * oi.price) AS amount, COUNT(DISTINCT o.id) AS orders
             FROM order_items oi
             JOIN products p ON p.id = oi.productId
             JOIN orders o ON o.id = oi.orderId
            WHERE p.companyId = ? AND o.createdAt >= ? AND o.createdAt < ? AND ${valid}
            GROUP BY p.id, p.name, p.image, o.currency
            ORDER BY quantity DESC
            LIMIT 10`,
          [c.id, p.from, p.to],
        );
        return rows.map((r) => ({ productId: r.productId, name: r.name, image: r.image ?? null, currency: r.currency, quantity: this.int(r.quantity), orders: this.int(r.orders), amount: this.n(r.amount) }));
      }),
      this.safe('orders.topCustomers', w, async () => {
        const rows = await this.q(
          `SELECT u.id AS userId, u.fullName AS fullName, u.phone AS phone, o.currency AS currency,
                  COUNT(DISTINCT o.id) AS orders, SUM(so.totalAmount) AS amount, MAX(o.createdAt) AS lastOrder
             ${base.replace('WHERE', 'JOIN users u ON u.id = o.userId WHERE')} AND o.createdAt >= ? AND o.createdAt < ? AND ${valid}
            GROUP BY u.id, u.fullName, u.phone, o.currency
            ORDER BY orders DESC, amount DESC
            LIMIT 10`,
          [c.id, p.from, p.to],
        );
        return rows.map((r) => ({ userId: r.userId, fullName: r.fullName, phone: r.phone, currency: r.currency, orders: this.int(r.orders), amount: this.n(r.amount), lastOrder: r.lastOrder }));
      }),
      this.safe('catalog', w, () => this.catalog(c, p)),
      this.safe('delivery', w, () => this.orderDelivery(c, p)),
    ]);

    const extra: Record<string, any> = {};
    const alerts: { key: string; level: 'info' | 'warning' | 'danger'; count: number }[] = [];
    if (cur.pending) alerts.push({ key: 'orders_pending', level: 'warning', count: cur.pending });
    if (catalog?.lowStock?.length) alerts.push({ key: 'low_stock', level: 'warning', count: catalog.lowStockCount });
    if (catalog?.outOfStock) alerts.push({ key: 'out_of_stock', level: 'danger', count: catalog.outOfStock });

    if (type === CompanyType.RESTAURANT) {
      extra.restaurant = await this.safe('restaurant.availability', w, () => this.restaurantAvailability(c, p));
      if (extra.restaurant?.pendingNow) alerts.push({ key: 'availability_pending', level: 'danger', count: extra.restaurant.pendingNow });
    }
    if (type === CompanyType.SERVICE) {
      extra.services = await this.safe('services', w, async () => {
        const r = await this.q('SELECT status, COUNT(*) AS count FROM services WHERE companyId = ? GROUP BY status', [c.id]);
        return { total: r.reduce((s, x) => s + this.int(x.count), 0), byStatus: this.countMap(r) };
      });
    }

    return {
      kpis,
      orders: { ...cur, byStatus, newCustomers },
      previous: prev,
      payments,
      charts: { timeline, byHour, byWeekday },
      topProducts,
      topCustomers,
      catalog,
      delivery,
      ...extra,
      alerts,
    };
  }

  /** Catalogue produits de l'entreprise : statuts, stock, produits jamais vendus sur la période */
  private async catalog(c: CompanyRow, p: Period) {
    const [byStatus, stock, lowStock, notSold] = await Promise.all([
      this.q('SELECT status, COUNT(*) AS count FROM products WHERE companyId = ? GROUP BY status', [c.id]),
      this.q(
        `SELECT COUNT(*) AS total, SUM(quantity <= 0) AS outOfStock,
                SUM(stockAlert > 0 AND quantity > 0 AND quantity <= stockAlert) AS lowStock, SUM(quantity) AS units
           FROM products WHERE companyId = ?`,
        [c.id],
      ),
      this.q(
        `SELECT id AS productId, name, quantity, stockAlert FROM products
          WHERE companyId = ? AND stockAlert > 0 AND quantity <= stockAlert
          ORDER BY quantity ASC LIMIT 20`,
        [c.id],
      ),
      this.q(
        `SELECT COUNT(*) AS total FROM products p
          WHERE p.companyId = ? AND NOT EXISTS (
                SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.orderId
                 WHERE oi.productId = p.id AND o.createdAt >= ? AND o.createdAt < ?)`,
        [c.id, p.from, p.to],
      ),
    ]);
    return {
      total: this.int(stock[0]?.total),
      byStatus: this.countMap(byStatus),
      units: this.int(stock[0]?.units),
      outOfStock: this.int(stock[0]?.outOfStock),
      lowStockCount: this.int(stock[0]?.lowStock),
      lowStock: lowStock.map((r) => ({ productId: r.productId, name: r.name, quantity: this.int(r.quantity), stockAlert: this.int(r.stockAlert) })),
      notSoldInPeriod: this.int(notSold[0]?.total),
    };
  }

  /** Livraisons des commandes de l'entreprise (order_delivery_assignments) */
  private async orderDelivery(c: CompanyRow, p: Period) {
    const scope = `JOIN orders o ON o.id = oda.orderId
                   WHERE EXISTS (SELECT 1 FROM sub_orders so WHERE so.orderId = o.id AND so.companyId = ?)
                     AND o.createdAt >= ? AND o.createdAt < ?`;
    const [byStatus, times, top] = await Promise.all([
      this.q(`SELECT oda.status AS status, COUNT(*) AS count FROM order_delivery_assignments oda ${scope} GROUP BY oda.status`, [c.id, p.from, p.to]),
      this.q(
        `SELECT AVG(TIMESTAMPDIFF(MINUTE, oda.assignedAt, oda.deliveredAt)) AS avgDeliveryMinutes,
                AVG(TIMESTAMPDIFF(MINUTE, o.createdAt, oda.assignedAt)) AS avgAssignMinutes,
                COUNT(DISTINCT oda.deliverId) AS deliverers
           FROM order_delivery_assignments oda ${scope} AND oda.deliveredAt IS NOT NULL`,
        [c.id, p.from, p.to],
      ),
      this.q(
        `SELECT u.id AS userId, u.fullName AS fullName, u.phone AS phone, COUNT(*) AS delivered,
                AVG(TIMESTAMPDIFF(MINUTE, oda.assignedAt, oda.deliveredAt)) AS avgMinutes
           FROM order_delivery_assignments oda JOIN users u ON u.id = oda.deliverId ${scope} AND oda.status = 'DELIVERED'
          GROUP BY u.id, u.fullName, u.phone ORDER BY delivered DESC LIMIT 10`,
        [c.id, p.from, p.to],
      ),
    ]);
    return {
      byStatus: this.countMap(byStatus),
      avgDeliveryMinutes: times[0]?.avgDeliveryMinutes != null ? Math.round(Number(times[0].avgDeliveryMinutes)) : null,
      avgAssignMinutes: times[0]?.avgAssignMinutes != null ? Math.round(Number(times[0].avgAssignMinutes)) : null,
      deliverers: this.int(times[0]?.deliverers),
      topDeliverers: top.map((r) => ({ userId: r.userId, fullName: r.fullName, phone: r.phone, delivered: this.int(r.delivered), avgMinutes: r.avgMinutes != null ? Math.round(Number(r.avgMinutes)) : null })),
    };
  }

  /** RESTAURANT : disponibilité des plats confirmée par le restaurant */
  private async restaurantAvailability(c: CompanyRow, p: Period) {
    const scope = `FROM order_items oi JOIN products p ON p.id = oi.productId JOIN orders o ON o.id = oi.orderId
                   WHERE p.companyId = ? AND oi.availabilityStatus IS NOT NULL`;
    const [byStatus, response, unavailable, pendingNow] = await Promise.all([
      this.q(`SELECT oi.availabilityStatus AS status, COUNT(*) AS count ${scope} AND o.createdAt >= ? AND o.createdAt < ? GROUP BY oi.availabilityStatus`, [c.id, p.from, p.to]),
      this.q(
        `SELECT AVG(TIMESTAMPDIFF(SECOND, o.createdAt, oi.availabilityConfirmedAt)) AS avgSeconds
           ${scope} AND o.createdAt >= ? AND o.createdAt < ? AND oi.availabilityConfirmedAt IS NOT NULL`,
        [c.id, p.from, p.to],
      ),
      this.q(
        `SELECT p.id AS productId, p.name AS name, COUNT(*) AS times
           ${scope} AND o.createdAt >= ? AND o.createdAt < ? AND oi.availabilityStatus = 'UNAVAILABLE'
          GROUP BY p.id, p.name ORDER BY times DESC LIMIT 10`,
        [c.id, p.from, p.to],
      ),
      this.q(
        `SELECT COUNT(DISTINCT o.id) AS orders ${scope} AND oi.availabilityStatus = 'PENDING'
            AND o.status IN ('PENDING','VALIDATED') AND o.cancelledAt IS NULL`,
        [c.id],
      ),
    ]);
    const counts = this.countMap(byStatus);
    const answered = (counts.AVAILABLE || 0) + (counts.UNAVAILABLE || 0);
    const total = answered + (counts.PENDING || 0);
    return {
      items: counts,
      responseRate: this.rate(answered, total),
      availabilityRate: this.rate(counts.AVAILABLE || 0, answered),
      avgResponseMinutes: response[0]?.avgSeconds != null ? Math.round(Number(response[0].avgSeconds) / 6) / 10 : null,
      mostUnavailable: unavailable.map((r) => ({ productId: r.productId, name: r.name, times: this.int(r.times) })),
      /** Commandes ouvertes qui attendent encore la réponse du restaurant */
      pendingNow: this.int(pendingNow[0]?.orders),
    };
  }

  // ============================================================
  // 2. HÔTEL
  // ============================================================
  private async hotelDashboard(c: CompanyRow, p: Period, w: string[]) {
    const base = `FROM reservations r JOIN products p ON p.id = r.productId WHERE p.companyId = ?`;
    const done = `r.status IN ('CONFIRMED','RESERVED','CHECKED_IN','CHECKED_OUT')`;

    const totals = async (from: Date, to: Date) => {
      const r = await this.q(
        `SELECT COUNT(*) AS reservations,
                SUM(${done}) AS confirmed,
                SUM(r.status IN ('CANCELLED','REJECTED','EXPIRED')) AS cancelled,
                SUM(CASE WHEN ${done} THEN r.totalPrice ELSE 0 END) AS revenue,
                SUM(CASE WHEN ${done} THEN GREATEST(DATEDIFF(r.endDate, r.startDate), 1) * GREATEST(COALESCE(r.roomsBooked, r.quantity, 1), 1) ELSE 0 END) AS roomNights,
                SUM(CASE WHEN ${done} THEN COALESCE(r.adults, 0) + COALESCE(r.children, 0) ELSE 0 END) AS guests,
                AVG(CASE WHEN ${done} THEN GREATEST(DATEDIFF(r.endDate, r.startDate), 1) END) AS avgStay,
                COUNT(DISTINCT r.userId) AS customers
           ${base} AND r.createdAt >= ? AND r.createdAt < ?`,
        [c.id, from, to],
      );
      const x = r[0] || {};
      return {
        reservations: this.int(x.reservations),
        confirmed: this.int(x.confirmed),
        cancelled: this.int(x.cancelled),
        revenue: this.n(x.revenue),
        roomNights: this.int(x.roomNights),
        guests: this.int(x.guests),
        avgStay: this.n(x.avgStay),
        customers: this.int(x.customers),
      };
    };
    const [cur, prev] = await Promise.all([totals(p.from, p.to), totals(p.prevFrom, p.prevTo)]);
    const adr = cur.roomNights ? this.n(cur.revenue / cur.roomNights) : 0; // prix moyen par nuitée
    const prevAdr = prev.roomNights ? this.n(prev.revenue / prev.roomNights) : 0;

    const occupancy = await this.safe('hotel.occupancy', w, async () => {
      const table = this.dataSource.getMetadata(RoomAvailability).tableName;
      const r = await this.q(
        `SELECT SUM(ra.roomsBooked) AS booked, SUM(ra.roomsBooked + ra.roomsRemaining) AS capacity
           FROM \`${table}\` ra JOIN products p ON p.id = ra.productId
          WHERE p.companyId = ? AND ra.date >= ? AND ra.date < ?`,
        [c.id, p.from, p.to],
      );
      return { roomNightsBooked: this.int(r[0]?.booked), roomNightsCapacity: this.int(r[0]?.capacity), rate: this.rate(this.int(r[0]?.booked), this.int(r[0]?.capacity)) };
    });

    const kpis = [
      this.kpi('reservations', cur.reservations, prev.reservations),
      this.kpi('confirmedReservations', cur.confirmed, prev.confirmed),
      this.kpi('revenue', cur.revenue, prev.revenue, 'money'),
      this.kpi('roomNights', cur.roomNights, prev.roomNights),
      this.kpi('averageDailyRate', adr, prevAdr, 'money'),
      this.kpi('guests', cur.guests, prev.guests),
      { key: 'occupancyRate', value: occupancy?.rate ?? null, previous: null, change: null, unit: 'percent' },
      { key: 'cancellationRate', value: this.rate(cur.cancelled, cur.reservations), previous: this.rate(prev.cancelled, prev.reservations), change: null, unit: 'percent' },
      { key: 'averageStay', value: cur.avgStay, previous: prev.avgStay, change: this.change(cur.avgStay, prev.avgStay), unit: 'nights' },
    ];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7 = new Date(today.getTime() + 7 * 24 * 3600 * 1000);
    const [byStatus, timeline, topRooms, arrivals, inHouse, rooms] = await Promise.all([
      this.safe('hotel.byStatus', w, async () => this.countMap(await this.q(`SELECT r.status AS status, COUNT(*) AS count ${base} AND r.createdAt >= ? AND r.createdAt < ? GROUP BY r.status`, [c.id, p.from, p.to]))),
      this.safe('hotel.timeline', w, async () => {
        const rows = await this.q(
          `SELECT DATE(r.createdAt) AS date, COUNT(*) AS reservations, SUM(CASE WHEN ${done} THEN r.totalPrice ELSE 0 END) AS revenue
             ${base} AND r.createdAt >= ? AND r.createdAt < ? GROUP BY DATE(r.createdAt) ORDER BY date`,
          [c.id, p.from, p.to],
        );
        return this.fillDays(
          p,
          rows.map((r) => ({ date: this.dateKey(r.date), reservations: this.int(r.reservations), revenue: this.n(r.revenue) })),
          () => ({ reservations: 0, revenue: 0 }),
        );
      }),
      this.safe('hotel.topRooms', w, async () => {
        const rows = await this.q(
          `SELECT p.id AS productId, p.name AS name, COUNT(*) AS reservations, SUM(r.totalPrice) AS revenue,
                  SUM(GREATEST(DATEDIFF(r.endDate, r.startDate), 1) * GREATEST(COALESCE(r.roomsBooked, r.quantity, 1), 1)) AS roomNights
             ${base} AND r.createdAt >= ? AND r.createdAt < ? AND ${done}
            GROUP BY p.id, p.name ORDER BY revenue DESC LIMIT 10`,
          [c.id, p.from, p.to],
        );
        return rows.map((r) => ({ productId: r.productId, name: r.name, reservations: this.int(r.reservations), roomNights: this.int(r.roomNights), revenue: this.n(r.revenue) }));
      }),
      this.safe('hotel.arrivals', w, async () => {
        const rows = await this.q(
          `SELECT r.id AS id, r.startDate AS startDate, r.endDate AS endDate, r.status AS status, r.roomsBooked AS rooms,
                  COALESCE(r.adults, 0) + COALESCE(r.children, 0) AS guests, p.name AS room, u.fullName AS customer, u.phone AS phone
             ${base.replace('WHERE', 'LEFT JOIN users u ON u.id = r.userId WHERE')}
              AND r.startDate >= ? AND r.startDate < ? AND r.status IN ('CONFIRMED','RESERVED','PENDING')
            ORDER BY r.startDate ASC LIMIT 20`,
          [c.id, this.dateKey(today), this.dateKey(in7)],
        );
        return rows.map((r) => ({ ...r, rooms: this.int(r.rooms), guests: this.int(r.guests) }));
      }),
      this.safe('hotel.inHouse', w, async () => {
        const r = await this.q(`SELECT COUNT(*) AS total, SUM(COALESCE(r.adults,0) + COALESCE(r.children,0)) AS guests ${base} AND r.status = 'CHECKED_IN'`, [c.id]);
        return { reservations: this.int(r[0]?.total), guests: this.int(r[0]?.guests) };
      }),
      this.safe('hotel.rooms', w, async () => {
        const [types, legacy] = await Promise.all([
          this.q('SELECT COUNT(*) AS total FROM products WHERE companyId = ?', [c.id]),
          this.q('SELECT status, COUNT(*) AS count FROM room WHERE companyId = ? GROUP BY status', [c.id]).catch((): any[] => []),
        ]);
        return { roomTypes: this.int(types[0]?.total), rooms: legacy.reduce((s: number, x: any) => s + this.int(x.count), 0), roomsByStatus: this.countMap(legacy) };
      }),
    ]);

    const alerts: { key: string; level: 'info' | 'warning' | 'danger'; count: number }[] = [];
    if (byStatus?.PENDING) alerts.push({ key: 'reservations_pending', level: 'warning', count: byStatus.PENDING });
    if (arrivals?.length) alerts.push({ key: 'arrivals_next_7_days', level: 'info', count: arrivals.length });

    return {
      kpis,
      hotel: { ...cur, averageDailyRate: adr, byStatus, occupancy, inHouse, rooms },
      previous: prev,
      charts: { timeline },
      topRooms,
      upcomingArrivals: arrivals,
      alerts,
    };
  }

  // ============================================================
  // 3. AGENCE DE TRANSPORT (voyages)
  // ============================================================
  private async transportDashboard(c: CompanyRow, p: Period, w: string[]) {
    const resBase = `FROM reservations_vehicules rv JOIN trips t ON t.id = rv.trip_id WHERE t.company_id = ?`;
    const ok = `rv.status IN ('CONFIRMED','COMPLETED')`;

    const totals = async (from: Date, to: Date) => {
      const [res, money, seats, trips] = await Promise.all([
        this.q(
          `SELECT COUNT(*) AS reservations, SUM(${ok}) AS confirmed, SUM(rv.status = 'CANCELLED') AS cancelled,
                  COUNT(DISTINCT rv.user_id) AS passengers
             ${resBase} AND rv.reservation_date >= ? AND rv.reservation_date < ?`,
          [c.id, from, to],
        ),
        this.q(
          `SELECT rv.currency AS currency, SUM(rv.total_amount) AS amount ${resBase}
              AND rv.reservation_date >= ? AND rv.reservation_date < ? AND ${ok} GROUP BY rv.currency`,
          [c.id, from, to],
        ),
        this.q(
          `SELECT COUNT(rs.id) AS seats FROM reservation_seats rs JOIN reservations_vehicules rv ON rv.id = rs.reservation_id
             JOIN trips t ON t.id = rv.trip_id
            WHERE t.company_id = ? AND rv.reservation_date >= ? AND rv.reservation_date < ? AND ${ok}`,
          [c.id, from, to],
        ),
        this.q(
          `SELECT COUNT(*) AS trips FROM trips t WHERE t.company_id = ? AND t.departure_datetime >= ? AND t.departure_datetime < ?`,
          [c.id, from, to],
        ),
      ]);
      return {
        reservations: this.int(res[0]?.reservations),
        confirmed: this.int(res[0]?.confirmed),
        cancelled: this.int(res[0]?.cancelled),
        passengers: this.int(res[0]?.passengers),
        revenue: this.money(money),
        seatsSold: this.int(seats[0]?.seats),
        trips: this.int(trips[0]?.trips),
      };
    };
    const [cur, prev] = await Promise.all([totals(p.from, p.to), totals(p.prevFrom, p.prevTo)]);

    const fill = await this.safe('transport.fillRate', w, async () => {
      const r = await this.q(
        `SELECT SUM(v.total_seats) AS capacity,
                (SELECT COUNT(rs.id) FROM reservation_seats rs JOIN reservations_vehicules rv ON rv.id = rs.reservation_id
                   JOIN trips t2 ON t2.id = rv.trip_id
                  WHERE t2.company_id = ? AND t2.departure_datetime >= ? AND t2.departure_datetime < ? AND rv.status IN ('CONFIRMED','COMPLETED')) AS sold
           FROM trips t JOIN vehicles v ON v.id = t.vehicle_id
          WHERE t.company_id = ? AND t.departure_datetime >= ? AND t.departure_datetime < ?`,
        [c.id, p.from, p.to, c.id, p.from, p.to],
      );
      return { seatsCapacity: this.int(r[0]?.capacity), seatsSold: this.int(r[0]?.sold), rate: this.rate(this.int(r[0]?.sold), this.int(r[0]?.capacity)) };
    });

    const kpis = [
      this.kpi('trips', cur.trips, prev.trips),
      this.kpi('reservations', cur.reservations, prev.reservations),
      this.kpi('revenue', cur.revenue, prev.revenue),
      this.kpi('seatsSold', cur.seatsSold, prev.seatsSold),
      this.kpi('passengers', cur.passengers, prev.passengers),
      { key: 'fillRate', value: fill?.rate ?? null, previous: null, change: null, unit: 'percent' },
      { key: 'cancellationRate', value: this.rate(cur.cancelled, cur.reservations), previous: this.rate(prev.cancelled, prev.reservations), change: null, unit: 'percent' },
    ];

    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const [tripsByStatus, reservationsByStatus, vehicles, payments, timeline, upcoming] = await Promise.all([
      this.safe('transport.tripsByStatus', w, async () => this.countMap(await this.q('SELECT status, COUNT(*) AS count FROM trips WHERE company_id = ? AND departure_datetime >= ? AND departure_datetime < ? GROUP BY status', [c.id, p.from, p.to]))),
      this.safe('transport.reservationsByStatus', w, async () => this.countMap(await this.q(`SELECT rv.status AS status, COUNT(*) AS count ${resBase} AND rv.reservation_date >= ? AND rv.reservation_date < ? GROUP BY rv.status`, [c.id, p.from, p.to]))),
      this.safe('transport.vehicles', w, async () => {
        const r = await this.q('SELECT status, COUNT(*) AS count, SUM(total_seats) AS seats FROM vehicles WHERE company_id = ? GROUP BY status', [c.id]);
        return { total: r.reduce((s, x) => s + this.int(x.count), 0), seats: r.reduce((s, x) => s + this.int(x.seats), 0), byStatus: this.countMap(r) };
      }),
      this.safe('transport.payments', w, async () => {
        const r = await this.q(
          `SELECT COALESCE(pay.payment_method, 'N/A') AS method, pay.status AS status, COUNT(*) AS count, SUM(pay.amount) AS amount
             FROM payments pay JOIN reservations_vehicules rv ON rv.id = pay.reservation_id JOIN trips t ON t.id = rv.trip_id
            WHERE t.company_id = ? AND pay.created_at >= ? AND pay.created_at < ?
            GROUP BY pay.payment_method, pay.status`,
          [c.id, p.from, p.to],
        );
        return r.map((x) => ({ method: x.method, status: x.status, count: this.int(x.count), amount: this.n(x.amount) }));
      }),
      this.safe('transport.timeline', w, async () => {
        const rows = await this.q(
          `SELECT DATE(rv.reservation_date) AS date, rv.currency AS currency, COUNT(*) AS reservations,
                  SUM(CASE WHEN ${ok} THEN rv.total_amount ELSE 0 END) AS amount
             ${resBase} AND rv.reservation_date >= ? AND rv.reservation_date < ?
            GROUP BY DATE(rv.reservation_date), rv.currency ORDER BY date`,
          [c.id, p.from, p.to],
        );
        const map = new Map<string, { date: string; reservations: number; revenue: Money }>();
        for (const r of rows) {
          const d = this.dateKey(r.date);
          const e = map.get(d) ?? { date: d, reservations: 0, revenue: {} };
          e.reservations += this.int(r.reservations);
          e.revenue[String(r.currency || 'N/A')] = this.n(r.amount);
          map.set(d, e);
        }
        return this.fillDays(p, [...map.values()], () => ({ reservations: 0, revenue: {} }));
      }),
      this.safe('transport.upcoming', w, async () => {
        const rows = await this.q(
          `SELECT t.id AS tripId, t.departure_datetime AS departure, t.status AS status, v.license_plate AS vehicle,
                  v.total_seats AS seats,
                  (SELECT COUNT(rs.id) FROM reservation_seats rs JOIN reservations_vehicules rv ON rv.id = rs.reservation_id
                    WHERE rv.trip_id = t.id AND rv.status IN ('CONFIRMED','COMPLETED','PENDING')) AS booked
             FROM trips t LEFT JOIN vehicles v ON v.id = t.vehicle_id
            WHERE t.company_id = ? AND t.departure_datetime >= ? AND t.departure_datetime < ?
            ORDER BY t.departure_datetime ASC LIMIT 20`,
          [c.id, now, in7],
        );
        return rows.map((r) => ({ ...r, seats: this.int(r.seats), booked: this.int(r.booked), fillRate: this.rate(this.int(r.booked), this.int(r.seats)) }));
      }),
    ]);

    const alerts: { key: string; level: 'info' | 'warning' | 'danger'; count: number }[] = [];
    if (reservationsByStatus?.PENDING) alerts.push({ key: 'reservations_pending', level: 'warning', count: reservationsByStatus.PENDING });
    if (upcoming?.length) alerts.push({ key: 'departures_next_7_days', level: 'info', count: upcoming.length });

    return {
      kpis,
      transport: { ...cur, fill, tripsByStatus, reservationsByStatus, vehicles },
      previous: prev,
      payments,
      charts: { timeline },
      upcomingDepartures: upcoming,
      alerts,
    };
  }

  // ============================================================
  // 4. LOGISTIQUE : SHIPPING / LOGISTIC_AGENCY / AGENCE (colis + LTA)
  // ============================================================
  private async logisticsDashboard(c: CompanyRow, p: Period, w: string[]) {
    const mine = `(s.pickupCompanyId = ? OR s.shippingCompanyId = ? OR s.deliveryCompanyId = ?)`;
    const ids = [c.id, c.id, c.id];
    // Montant revenant à l'entreprise selon son rôle dans le colis
    const myAmount = `(CASE WHEN s.pickupCompanyId = ? THEN COALESCE(s.pickupPrice, 0) ELSE 0 END
                     + CASE WHEN s.shippingCompanyId = ? THEN COALESCE(s.shippingPrice, 0) ELSE 0 END
                     + CASE WHEN s.deliveryCompanyId = ? THEN COALESCE(s.deliveryPrice, 0) ELSE 0 END)`;

    const totals = async (from: Date, to: Date) => {
      const r = await this.q(
        `SELECT COUNT(*) AS shipments,
                SUM(s.status = 'DELIVERED') AS delivered,
                SUM(s.status NOT IN ('DELIVERED','COLLECTED','PENDING')) AS inTransit,
                SUM(s.status = 'PENDING') AS pending,
                SUM(${myAmount}) AS revenue,
                SUM(CASE WHEN (s.isPaid = 1 OR s.paid = 1) THEN ${myAmount} ELSE 0 END) AS paidRevenue,
                SUM(CASE WHEN (s.isPaid = 1 OR s.paid = 1) THEN 0 ELSE 1 END) AS unpaid,
                COUNT(DISTINCT s.userId) AS customers
           FROM shipments s WHERE ${mine} AND s.createdAt >= ? AND s.createdAt < ?`,
        [...ids, ...ids, ...ids, from, to],
      );
      const x = r[0] || {};
      return {
        shipments: this.int(x.shipments),
        delivered: this.int(x.delivered),
        inTransit: this.int(x.inTransit),
        pending: this.int(x.pending),
        revenue: this.n(x.revenue),
        paidRevenue: this.n(x.paidRevenue),
        unpaid: this.int(x.unpaid),
        customers: this.int(x.customers),
      };
    };
    const [cur, prev] = await Promise.all([totals(p.from, p.to), totals(p.prevFrom, p.prevTo)]);

    const kpis = [
      this.kpi('shipments', cur.shipments, prev.shipments),
      this.kpi('revenue', cur.revenue, prev.revenue, 'money'),
      this.kpi('paidRevenue', cur.paidRevenue, prev.paidRevenue, 'money'),
      this.kpi('delivered', cur.delivered, prev.delivered),
      this.kpi('inTransit', cur.inTransit, prev.inTransit),
      this.kpi('unpaidShipments', cur.unpaid, prev.unpaid),
      this.kpi('customers', cur.customers, prev.customers),
      { key: 'deliveryRate', value: this.rate(cur.delivered, cur.shipments), previous: this.rate(prev.delivered, prev.shipments), change: null, unit: 'percent' },
    ];

    const [byStatus, byRole, timeline, routes, lta, parcels] = await Promise.all([
      this.safe('logistics.byStatus', w, async () => this.countMap(await this.q(`SELECT s.status AS status, COUNT(*) AS count FROM shipments s WHERE ${mine} AND s.createdAt >= ? AND s.createdAt < ? GROUP BY s.status`, [...ids, p.from, p.to]))),
      this.safe('logistics.byRole', w, async () => {
        const r = await this.q(
          `SELECT SUM(s.pickupCompanyId = ?) AS pickup, SUM(s.shippingCompanyId = ?) AS shipping, SUM(s.deliveryCompanyId = ?) AS delivery,
                  SUM(CASE WHEN s.pickupCompanyId = ? THEN COALESCE(s.pickupPrice,0) ELSE 0 END) AS pickupAmount,
                  SUM(CASE WHEN s.shippingCompanyId = ? THEN COALESCE(s.shippingPrice,0) ELSE 0 END) AS shippingAmount,
                  SUM(CASE WHEN s.deliveryCompanyId = ? THEN COALESCE(s.deliveryPrice,0) ELSE 0 END) AS deliveryAmount
             FROM shipments s WHERE ${mine} AND s.createdAt >= ? AND s.createdAt < ?`,
          [...ids, ...ids, ...ids, p.from, p.to],
        );
        const x = r[0] || {};
        return {
          pickup: { count: this.int(x.pickup), amount: this.n(x.pickupAmount) },
          shipping: { count: this.int(x.shipping), amount: this.n(x.shippingAmount) },
          delivery: { count: this.int(x.delivery), amount: this.n(x.deliveryAmount) },
        };
      }),
      this.safe('logistics.timeline', w, async () => {
        const rows = await this.q(
          `SELECT DATE(s.createdAt) AS date, COUNT(*) AS shipments, SUM(s.status = 'DELIVERED') AS delivered, SUM(${myAmount}) AS revenue
             FROM shipments s WHERE ${mine} AND s.createdAt >= ? AND s.createdAt < ?
            GROUP BY DATE(s.createdAt) ORDER BY date`,
          [...ids, ...ids, p.from, p.to],
        );
        return this.fillDays(
          p,
          rows.map((r) => ({ date: this.dateKey(r.date), shipments: this.int(r.shipments), delivered: this.int(r.delivered), revenue: this.n(r.revenue) })),
          () => ({ shipments: 0, delivered: 0, revenue: 0 }),
        );
      }),
      this.safe('logistics.routes', w, async () => {
        const rows = await this.q(
          `SELECT COALESCE(s.shippingFrom, s.pickupFrom) AS origin, COALESCE(s.shippingTo, s.deliveryTo) AS destination,
                  COUNT(*) AS shipments, SUM(${myAmount}) AS revenue
             FROM shipments s WHERE ${mine} AND s.createdAt >= ? AND s.createdAt < ?
            GROUP BY COALESCE(s.shippingFrom, s.pickupFrom), COALESCE(s.shippingTo, s.deliveryTo)
            ORDER BY shipments DESC LIMIT 10`,
          [...ids, ...ids, p.from, p.to],
        );
        return rows.map((r) => ({ origin: r.origin, destination: r.destination, shipments: this.int(r.shipments), revenue: this.n(r.revenue) }));
      }),
      this.safe('logistics.lta', w, async () => {
        const scope = `FROM lta l WHERE (l.Issued_byId = ? OR l.shipperId = ? OR l.consigneeId = ?) AND l.createdAt >= ? AND l.createdAt < ?`;
        const [st, mode] = await Promise.all([
          this.q(`SELECT l.status AS status, COUNT(*) AS count ${scope} GROUP BY l.status`, [...ids, p.from, p.to]),
          this.q(`SELECT l.type AS mode, COUNT(*) AS count ${scope} GROUP BY l.type`, [...ids, p.from, p.to]),
        ]);
        return { total: st.reduce((s, x) => s + this.int(x.count), 0), byStatus: this.countMap(st), byTransportMode: this.countMap(mode, 'mode') };
      }),
      this.safe('logistics.parcelStock', w, async () => {
        const r = await this.q(
          `SELECT COUNT(*) AS total FROM branch_parcel_stocks bps JOIN branches b ON b.id = bps.branchId WHERE b.company_id = ?`,
          [c.id],
        );
        return { inBranches: this.int(r[0]?.total) };
      }),
    ]);

    const alerts: { key: string; level: 'info' | 'warning' | 'danger'; count: number }[] = [];
    if (cur.pending) alerts.push({ key: 'shipments_pending', level: 'warning', count: cur.pending });
    if (cur.unpaid) alerts.push({ key: 'shipments_unpaid', level: 'danger', count: cur.unpaid });

    return {
      kpis,
      logistics: { ...cur, byStatus, byRole, parcels },
      previous: prev,
      lta,
      charts: { timeline },
      topRoutes: routes,
      alerts,
    };
  }

  // ============================================================
  // 5. TAXI (courses)
  // ============================================================
  private async taxiDashboard(c: CompanyRow, p: Period, w: string[]) {
    const totals = async (from: Date, to: Date) => {
      const [counts, money] = await Promise.all([
        this.q(
          `SELECT COUNT(*) AS rides, SUM(status = 'COMPLETED') AS completed, SUM(status = 'CANCELLED') AS cancelled,
                  COUNT(DISTINCT riderId) AS riders, COUNT(DISTINCT CASE WHEN status = 'COMPLETED' THEN driverId END) AS drivers,
                  AVG(CASE WHEN status = 'COMPLETED' THEN distance END) AS avgDistance,
                  AVG(CASE WHEN status = 'COMPLETED' THEN duration END) AS avgDuration,
                  AVG(driverRating) AS avgRating
             FROM rides WHERE createdAt >= ? AND createdAt < ?`,
          [from, to],
        ),
        this.q(
          `SELECT COALESCE(currency, 'N/A') AS currency, SUM(COALESCE(finalPrice, price)) AS amount,
                  SUM(COALESCE(commissionAmount, 0)) AS commission, SUM(COALESCE(driverEarning, 0)) AS driverEarning
             FROM rides WHERE status = 'COMPLETED' AND createdAt >= ? AND createdAt < ? GROUP BY currency`,
          [from, to],
        ),
      ]);
      const x = counts[0] || {};
      return {
        rides: this.int(x.rides),
        completed: this.int(x.completed),
        cancelled: this.int(x.cancelled),
        riders: this.int(x.riders),
        activeDrivers: this.int(x.drivers),
        avgDistance: this.n(x.avgDistance),
        avgDuration: this.n(x.avgDuration),
        avgRating: x.avgRating != null ? this.n(x.avgRating) : null,
        revenue: this.money(money, 'amount'),
        commission: this.money(money, 'commission'),
        driverEarning: this.money(money, 'driverEarning'),
      };
    };
    const [cur, prev] = await Promise.all([totals(p.from, p.to), totals(p.prevFrom, p.prevTo)]);

    const kpis = [
      this.kpi('rides', cur.rides, prev.rides),
      this.kpi('completedRides', cur.completed, prev.completed),
      this.kpi('revenue', cur.revenue, prev.revenue),
      this.kpi('commission', cur.commission, prev.commission),
      this.kpi('driverEarning', cur.driverEarning, prev.driverEarning),
      this.kpi('activeDrivers', cur.activeDrivers, prev.activeDrivers),
      this.kpi('riders', cur.riders, prev.riders),
      { key: 'completionRate', value: this.rate(cur.completed, cur.rides), previous: this.rate(prev.completed, prev.rides), change: null, unit: 'percent' },
      { key: 'averageRating', value: cur.avgRating, previous: prev.avgRating, change: null, unit: 'rating' },
    ];

    const [byStatus, payments, cancelledBy, timeline, byHour, topDrivers, fleet] = await Promise.all([
      this.safe('taxi.byStatus', w, async () => this.countMap(await this.q('SELECT status, COUNT(*) AS count FROM rides WHERE createdAt >= ? AND createdAt < ? GROUP BY status', [p.from, p.to]))),
      this.safe('taxi.payments', w, async () => {
        const r = await this.q(
          `SELECT COALESCE(paymentMethod, 'N/A') AS method, COALESCE(currency, 'N/A') AS currency, COUNT(*) AS count,
                  SUM(COALESCE(finalPrice, price)) AS amount, SUM(COALESCE(commissionAmount, 0)) AS commission
             FROM rides WHERE status = 'COMPLETED' AND createdAt >= ? AND createdAt < ? GROUP BY paymentMethod, currency`,
          [p.from, p.to],
        );
        return r.map((x) => ({ method: x.method, currency: x.currency, count: this.int(x.count), amount: this.n(x.amount), commission: this.n(x.commission) }));
      }),
      this.safe('taxi.cancelledBy', w, async () => this.countMap(await this.q("SELECT COALESCE(cancelledBy, 'N/A') AS who, COUNT(*) AS count FROM rides WHERE status = 'CANCELLED' AND createdAt >= ? AND createdAt < ? GROUP BY cancelledBy", [p.from, p.to]), 'who')),
      this.safe('taxi.timeline', w, async () => {
        const rows = await this.q(
          `SELECT DATE(createdAt) AS date, COALESCE(currency, 'N/A') AS currency, COUNT(*) AS rides, SUM(status = 'COMPLETED') AS completed,
                  SUM(CASE WHEN status = 'COMPLETED' THEN COALESCE(finalPrice, price) ELSE 0 END) AS amount
             FROM rides WHERE createdAt >= ? AND createdAt < ? GROUP BY DATE(createdAt), currency ORDER BY date`,
          [p.from, p.to],
        );
        const map = new Map<string, { date: string; rides: number; completed: number; revenue: Money }>();
        for (const r of rows) {
          const d = this.dateKey(r.date);
          const e = map.get(d) ?? { date: d, rides: 0, completed: 0, revenue: {} };
          e.rides += this.int(r.rides);
          e.completed += this.int(r.completed);
          if (Number(r.amount)) e.revenue[String(r.currency)] = this.n(r.amount);
          map.set(d, e);
        }
        return this.fillDays(p, [...map.values()], () => ({ rides: 0, completed: 0, revenue: {} }));
      }),
      this.safe('taxi.byHour', w, async () => {
        const rows = await this.q('SELECT HOUR(createdAt) AS hour, COUNT(*) AS count FROM rides WHERE createdAt >= ? AND createdAt < ? GROUP BY HOUR(createdAt)', [p.from, p.to]);
        const m = new Map(rows.map((r) => [this.int(r.hour), this.int(r.count)]));
        return Array.from({ length: 24 }, (_, h) => ({ hour: h, rides: m.get(h) ?? 0 }));
      }),
      this.safe('taxi.topDrivers', w, async () => {
        const rows = await this.q(
          `SELECT u.id AS driverId, u.fullName AS fullName, u.phone AS phone, COALESCE(r.currency, 'N/A') AS currency,
                  COUNT(*) AS rides, SUM(COALESCE(r.finalPrice, r.price)) AS amount, SUM(COALESCE(r.commissionAmount, 0)) AS commission,
                  AVG(r.driverRating) AS rating
             FROM rides r JOIN users u ON u.id = r.driverId
            WHERE r.status = 'COMPLETED' AND r.createdAt >= ? AND r.createdAt < ?
            GROUP BY u.id, u.fullName, u.phone, r.currency ORDER BY rides DESC LIMIT 10`,
          [p.from, p.to],
        );
        return rows.map((r) => ({ driverId: r.driverId, fullName: r.fullName, phone: r.phone, currency: r.currency, rides: this.int(r.rides), amount: this.n(r.amount), commission: this.n(r.commission), rating: r.rating != null ? this.n(r.rating) : null }));
      }),
      this.safe('taxi.fleet', w, async () => {
        const r = await this.q('SELECT kycStatus AS status, COUNT(*) AS count, SUM(isActive = 1) AS active FROM driver_vehicles GROUP BY kycStatus');
        return { vehicles: r.reduce((s, x) => s + this.int(x.count), 0), active: r.reduce((s, x) => s + this.int(x.active), 0), byKycStatus: this.countMap(r) };
      }),
    ]);

    const alerts: { key: string; level: 'info' | 'warning' | 'danger'; count: number }[] = [];
    if (fleet?.byKycStatus?.PENDING) alerts.push({ key: 'vehicles_kyc_pending', level: 'warning', count: fleet.byKycStatus.PENDING });
    const failed = await this.safe('taxi.commissionFailed', w, async () => {
      const r = await this.q("SELECT COUNT(*) AS total FROM driver_wallet_movements WHERE taxiCreditStatus = 'FAILED'");
      return this.int(r[0]?.total);
    });
    if (failed) alerts.push({ key: 'cash_commission_failed', level: 'danger', count: failed });

    return {
      kpis,
      taxi: { ...cur, byStatus, cancelledBy, fleet },
      previous: prev,
      payments,
      charts: { timeline, byHour },
      topDrivers,
      alerts,
    };
  }
}
