import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Ride } from './entity/Ride.entity';
import { RideStatus } from './enum/RideStatus.enum';
import { RIDE_DRIVER_COLLECTED_METHODS, RidePaymentStatus } from './enum/ride-event.enum';
import {
  RideAdminDriversQueryDto,
  RideAdminFilterDto,
  RideAdminListQueryDto,
  RideCashCommissionQueryDto,
} from './dto/ride-admin-dashboard.dto';
import { DriverWalletMovement } from '../DriverCashout/entity/driver-wallet-movement.entity';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';

const ACTIVE_STATUSES = [RideStatus.SEARCHING, RideStatus.ACCEPTED, RideStatus.ARRIVED, RideStatus.IN_PROGRESS];
const DEFAULT_DAYS = 30;

/**
 * ✅ Tableau de bord des courses taxi (administration) — lecture seule, aucune donnée modifiée.
 *
 *  Tous les montants sont donnés PAR DEVISE (USD, CDF…) : jamais additionnés entre devises.
 *  Montant d'une course = prix final (à défaut prix annoncé). Distances en km, durées en minutes.
 */
@Injectable()
export class RideAdminDashboardService {
  constructor(
    @InjectRepository(Ride) private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DriverWalletMovement) private readonly movementRepo: Repository<DriverWalletMovement>,
    private readonly i18n: I18nService,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.i18n.translate(key, lang, params);
  }

  private n(v: any): number {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  private r2(v: any): number {
    return Math.round(this.n(v) * 100) / 100;
  }

  /** Devise par défaut (courses anciennes sans devise), écrite en clair : même expression partout */
  private get curExpr(): string {
    const def = String(process.env.RIDE_PRICING_CURRENCY || 'USD').toUpperCase().replace(/[^A-Z]/g, '') || 'USD';
    return `UPPER(COALESCE(r.currency, '${def}'))`;
  }

  /** Montant de la course */
  private readonly gross = 'COALESCE(r.finalPrice, r.price, 0)';

  private parseDay(value: string, endOfDay: boolean): Date {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  /** Période : from / to, sinon les 30 derniers jours */
  private period(f: { from?: string; to?: string }, lang: string) {
    const to = f.to ? this.parseDay(f.to, true) : new Date();
    let from: Date;
    if (f.from) from = this.parseDay(f.from, false);
    else {
      from = new Date(to);
      from.setDate(from.getDate() - (DEFAULT_DAYS - 1));
      from.setHours(0, 0, 0, 0);
    }
    if (from > to) throw new BadRequestException(this.t('ride.admin.invalid_period', lang));
    return { from, to };
  }

  private groupByFor(from: Date, to: Date, requested?: 'day' | 'week' | 'month'): 'day' | 'week' | 'month' {
    if (requested) return requested;
    const days = (to.getTime() - from.getTime()) / 86400000;
    if (days <= 62) return 'day';
    if (days <= 366) return 'week';
    return 'month';
  }

  private periodExpr(groupBy: 'day' | 'week' | 'month'): string {
    if (groupBy === 'month') return "DATE_FORMAT(r.createdAt, '%Y-%m')";
    if (groupBy === 'week') return "DATE_FORMAT(DATE_SUB(DATE(r.createdAt), INTERVAL WEEKDAY(r.createdAt) DAY), '%Y-%m-%d')";
    return "DATE_FORMAT(r.createdAt, '%Y-%m-%d')";
  }

  private pad(n: number) {
    return String(n).padStart(2, '0');
  }

  /** Toutes les périodes entre from et to (pour une courbe sans trou) */
  private periodKeys(from: Date, to: Date, groupBy: 'day' | 'week' | 'month'): string[] {
    const keys: string[] = [];
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    if (groupBy === 'month') {
      d.setDate(1);
      while (d <= to && keys.length < 400) {
        keys.push(`${d.getFullYear()}-${this.pad(d.getMonth() + 1)}`);
        d.setMonth(d.getMonth() + 1);
      }
      return keys;
    }
    if (groupBy === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lundi
    const step = groupBy === 'week' ? 7 : 1;
    while (d <= to && keys.length < 800) {
      keys.push(`${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`);
      d.setDate(d.getDate() + step);
    }
    return keys;
  }

  /**
   * Requête de base avec tous les filtres.
   * opts.skipDate / skipStatus : pour les courses en cours (« en direct »).
   */
  private base(
    f: RideAdminFilterDto,
    range: { from: Date; to: Date },
    opts: { skipDate?: boolean; skipStatus?: boolean } = {},
  ): SelectQueryBuilder<Ride> {
    const qb = this.rideRepo.createQueryBuilder('r');
    qb.where('1 = 1');
    if (!opts.skipDate) qb.andWhere('r.createdAt BETWEEN :from AND :to', { from: range.from, to: range.to });
    if (f.driverId) qb.andWhere('r.driverId = :driverId', { driverId: f.driverId });
    if (f.riderId) qb.andWhere('r.riderId = :riderId', { riderId: f.riderId });
    if (f.cityId) qb.andWhere('r.cityId = :cityId', { cityId: f.cityId });
    if (f.categoryId) qb.andWhere('r.categoryId = :categoryId', { categoryId: f.categoryId });
    if (f.associationId) qb.andWhere('r.associationId = :associationId', { associationId: f.associationId });
    if (f.vehicleId) qb.andWhere('r.vehicleId = :vehicleId', { vehicleId: f.vehicleId });
    if (!opts.skipStatus && f.status?.length) qb.andWhere('r.status IN (:...status)', { status: f.status });
    if (f.paymentMethod?.length) {
      qb.andWhere("UPPER(COALESCE(r.paymentMethod, 'CASH')) IN (:...pm)", { pm: f.paymentMethod });
    }
    if (f.paymentStatus?.length) {
      qb.andWhere("UPPER(COALESCE(r.paymentStatus, 'PENDING')) IN (:...ps)", { ps: f.paymentStatus });
    }
    if (f.currency) qb.andWhere(`${this.curExpr} = :currency`, { currency: f.currency });
    if (f.cancelledBy) qb.andWhere('r.cancelledBy = :cancelledBy', { cancelledBy: f.cancelledBy });
    if (f.search) {
      const s = `%${f.search.toLowerCase()}%`;
      const phone = `%${f.search.replace(/[\s+]/g, '')}%`;
      qb.leftJoin('r.driver', 'sd')
        .leftJoin('r.rider', 'sr')
        .andWhere(
          '(LOWER(sd.fullName) LIKE :s OR LOWER(sr.fullName) LIKE :s ' +
          "OR REPLACE(REPLACE(COALESCE(sd.phone, ''), ' ', ''), '+', '') LIKE :phone " +
          "OR REPLACE(REPLACE(COALESCE(sr.phone, ''), ' ', ''), '+', '') LIKE :phone " +
          'OR LOWER(r.id) LIKE :ref)',
          { s, phone, ref: `${f.search.toLowerCase()}%` },
        );
    }
    return qb;
  }

  // ============================================================
  // 📊 TABLEAU DE BORD
  // ============================================================
  async dashboard(f: RideAdminFilterDto, lang = 'fr') {
    const range = this.period(f, lang);
    const groupBy = this.groupByFor(range.from, range.to, f.groupBy);
    const cur = this.curExpr;
    const g = this.gross;
    const done = RideStatus.COMPLETED;
    const cancelled = RideStatus.CANCELLED;
    const paid = RidePaymentStatus.PAID;
    const collected = RIDE_DRIVER_COLLECTED_METHODS.map((m) => `'${m}'`).join(',');
    const pExpr = this.periodExpr(groupBy);

    const [
      statusRows,
      revenueRows,
      methodRows,
      cancelRows,
      perfRow,
      timelineRows,
      timelineMoneyRows,
      driverRows,
      cityRows,
      categoryRows,
      liveRows,
      cashRows,
    ] = await Promise.all([
      // Statuts
      this.base(f, range).select('r.status', 'status').addSelect('COUNT(*)', 'n').groupBy('r.status').getRawMany(),

      // Chiffre d'affaires par devise (courses terminées)
      this.base(f, range)
        .andWhere('r.status = :done', { done })
        .select(cur, 'currency')
        .addSelect('COUNT(*)', 'rides')
        .addSelect(`SUM(${g})`, 'gross')
        .addSelect('SUM(COALESCE(r.commissionAmount, 0))', 'commission')
        .addSelect('SUM(COALESCE(r.driverEarning, 0))', 'driverEarnings')
        .addSelect('SUM(COALESCE(r.associationCommissionAmount, 0))', 'associationCommission')
        .addSelect('SUM(COALESCE(r.transactionFee, 0))', 'transactionFees')
        .addSelect(`SUM(CASE WHEN r.paymentStatus = '${paid}' THEN 1 ELSE 0 END)`, 'paidRides')
        .addSelect(`SUM(CASE WHEN r.paymentStatus = '${paid}' THEN ${g} ELSE 0 END)`, 'paidAmount')
        .addSelect(`SUM(CASE WHEN r.paymentStatus <> '${paid}' OR r.paymentStatus IS NULL THEN ${g} ELSE 0 END)`, 'unpaidAmount')
        .addSelect(`SUM(CASE WHEN UPPER(COALESCE(r.paymentMethod, 'CASH')) IN (${collected}) THEN ${g} ELSE 0 END)`, 'collectedByDrivers')
        .addSelect(`SUM(CASE WHEN UPPER(COALESCE(r.paymentMethod, 'CASH')) NOT IN (${collected}) THEN ${g} ELSE 0 END)`, 'collectedInApp')
        .addSelect(`AVG(${g})`, 'averagePrice')
        .groupBy(cur)
        .orderBy(cur, 'ASC')
        .getRawMany(),

      // Modes de paiement (courses terminées)
      this.base(f, range)
        .andWhere('r.status = :done', { done })
        .select("UPPER(COALESCE(r.paymentMethod, 'CASH'))", 'method')
        .addSelect(cur, 'currency')
        .addSelect('COUNT(*)', 'rides')
        .addSelect(`SUM(${g})`, 'gross')
        .addSelect(`SUM(CASE WHEN r.paymentStatus = '${paid}' THEN 1 ELSE 0 END)`, 'paidRides')
        .groupBy("UPPER(COALESCE(r.paymentMethod, 'CASH'))")
        .addGroupBy(cur)
        .orderBy('rides', 'DESC')
        .getRawMany(),

      // Annulations : par qui
      this.base(f, range)
        .andWhere('r.status = :cancelled', { cancelled })
        .select("COALESCE(r.cancelledBy, 'SYSTEM')", 'by')
        .addSelect('COUNT(*)', 'n')
        .groupBy("COALESCE(r.cancelledBy, 'SYSTEM')")
        .getRawMany(),

      // Performance
      this.base(f, range)
        .select(`AVG(CASE WHEN r.status = '${done}' THEN r.distance END)`, 'avgDistanceKm')
        .addSelect(`AVG(CASE WHEN r.status = '${done}' THEN r.duration END)`, 'avgDurationMin')
        .addSelect(`SUM(CASE WHEN r.status = '${done}' THEN COALESCE(r.distance, 0) ELSE 0 END)`, 'totalDistanceKm')
        .addSelect('AVG(CASE WHEN r.acceptedAt IS NOT NULL THEN TIMESTAMPDIFF(SECOND, r.createdAt, r.acceptedAt) END)', 'avgAcceptSeconds')
        .addSelect('AVG(CASE WHEN r.arrivedAt IS NOT NULL AND r.acceptedAt IS NOT NULL THEN TIMESTAMPDIFF(SECOND, r.acceptedAt, r.arrivedAt) END)', 'avgPickupSeconds')
        .addSelect(`AVG(CASE WHEN r.status = '${done}' AND r.startedAt IS NOT NULL AND r.completedAt IS NOT NULL THEN TIMESTAMPDIFF(SECOND, r.startedAt, r.completedAt) END)`, 'avgTripSeconds')
        .addSelect('AVG(r.driverRating)', 'avgDriverRating')
        .addSelect('COUNT(r.driverRating)', 'driverRatings')
        .addSelect('AVG(r.riderRating)', 'avgRiderRating')
        .addSelect('COUNT(DISTINCT r.driverId)', 'activeDrivers')
        .addSelect('COUNT(DISTINCT r.riderId)', 'activeRiders')
        .getRawOne(),

      // Courbe : nombre de courses
      this.base(f, range)
        .select(pExpr, 'period')
        .addSelect('COUNT(*)', 'total')
        .addSelect(`SUM(CASE WHEN r.status = '${done}' THEN 1 ELSE 0 END)`, 'completed')
        .addSelect(`SUM(CASE WHEN r.status = '${cancelled}' THEN 1 ELSE 0 END)`, 'cancelled')
        .groupBy(pExpr)
        .getRawMany(),

      // Courbe : montants par devise
      this.base(f, range)
        .andWhere('r.status = :done', { done })
        .select(pExpr, 'period')
        .addSelect(cur, 'currency')
        .addSelect(`SUM(${g})`, 'gross')
        .addSelect('SUM(COALESCE(r.commissionAmount, 0))', 'commission')
        .groupBy(pExpr)
        .addGroupBy(cur)
        .getRawMany(),

      // Meilleurs chauffeurs
      this.base(f, range)
        .andWhere('r.driverId IS NOT NULL')
        .leftJoin('r.driver', 'td')
        .select('r.driverId', 'driverId')
        .addSelect('MAX(td.fullName)', 'fullName')
        .addSelect('MAX(td.phone)', 'phone')
        .addSelect('MAX(td.image)', 'image')
        .addSelect('COUNT(*)', 'rides')
        .addSelect(`SUM(CASE WHEN r.status = '${done}' THEN 1 ELSE 0 END)`, 'completed')
        .addSelect(`SUM(CASE WHEN r.status = '${cancelled}' AND r.cancelledBy = 'DRIVER' THEN 1 ELSE 0 END)`, 'cancelledByDriver')
        .addSelect('AVG(r.driverRating)', 'rating')
        .addSelect(`SUM(CASE WHEN r.status = '${done}' THEN COALESCE(r.distance, 0) ELSE 0 END)`, 'distanceKm')
        .groupBy('r.driverId')
        .orderBy('completed', 'DESC')
        .addOrderBy('rides', 'DESC')
        .limit(10)
        .getRawMany(),

      // Villes
      this.base(f, range)
        .leftJoin('r.city', 'ci')
        .select('r.cityId', 'cityId')
        .addSelect('MAX(ci.name)', 'name')
        .addSelect('COUNT(*)', 'rides')
        .addSelect(`SUM(CASE WHEN r.status = '${done}' THEN 1 ELSE 0 END)`, 'completed')
        .addSelect(`SUM(CASE WHEN r.status = '${cancelled}' THEN 1 ELSE 0 END)`, 'cancelled')
        .groupBy('r.cityId')
        .orderBy('rides', 'DESC')
        .limit(20)
        .getRawMany(),

      // Catégories
      this.base(f, range)
        .leftJoin('r.category', 'ca')
        .select('r.categoryId', 'categoryId')
        .addSelect('MAX(ca.name)', 'name')
        .addSelect('COUNT(*)', 'rides')
        .addSelect(`SUM(CASE WHEN r.status = '${done}' THEN 1 ELSE 0 END)`, 'completed')
        .addSelect(`SUM(CASE WHEN r.status = '${cancelled}' THEN 1 ELSE 0 END)`, 'cancelled')
        .groupBy('r.categoryId')
        .orderBy('rides', 'DESC')
        .limit(20)
        .getRawMany(),

      // En direct (maintenant, sans filtre de période ni de statut)
      this.base(f, range, { skipDate: true, skipStatus: true })
        .andWhere('r.status IN (:...active)', { active: ACTIVE_STATUSES })
        .select('r.status', 'status')
        .addSelect('COUNT(*)', 'n')
        .groupBy('r.status')
        .getRawMany(),

      // Commissions des courses en espèces débitées des chauffeurs
      this.cashSummaryQuery(f, range),
    ]);

    // ---------- Vue d'ensemble ----------
    const byStatus: Record<string, number> = {};
    for (const s of Object.values(RideStatus)) byStatus[s] = 0;
    for (const row of statusRows) byStatus[row.status] = this.n(row.n);
    const totalRides = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const completed = byStatus[RideStatus.COMPLETED];
    const cancelledCount = byStatus[RideStatus.CANCELLED];
    const inProgress = ACTIVE_STATUSES.reduce((a, s) => a + (byStatus[s] || 0), 0);
    const finished = completed + cancelledCount;

    // ---------- Courbe ----------
    const countsBy = new Map<string, any>(timelineRows.map((t: any) => [t.period, t]));
    const moneyBy = new Map<string, Record<string, { gross: number; commission: number }>>();
    for (const row of timelineMoneyRows) {
      const m = moneyBy.get(row.period) ?? {};
      m[row.currency] = { gross: this.r2(row.gross), commission: this.r2(row.commission) };
      moneyBy.set(row.period, m);
    }
    const timeline = this.periodKeys(range.from, range.to, groupBy).map((period) => {
      const c = countsBy.get(period);
      return {
        period,
        total: this.n(c?.total),
        completed: this.n(c?.completed),
        cancelled: this.n(c?.cancelled),
        revenue: moneyBy.get(period) ?? {},
      };
    });

    // ---------- Meilleurs chauffeurs : montants par devise ----------
    const driverIds = driverRows.map((d) => d.driverId).filter(Boolean);
    const driverMoney = driverIds.length
      ? await this.base(f, range)
        .andWhere('r.status = :done', { done })
        .andWhere('r.driverId IN (:...driverIds)', { driverIds })
        .select('r.driverId', 'driverId')
        .addSelect(cur, 'currency')
        .addSelect(`SUM(${g})`, 'gross')
        .addSelect('SUM(COALESCE(r.commissionAmount, 0))', 'commission')
        .addSelect('SUM(COALESCE(r.driverEarning, 0))', 'earnings')
        .groupBy('r.driverId')
        .addGroupBy(cur)
        .getRawMany()
      : [];

    // ---------- ✅ Commissions par devise ET par moyen de paiement ----------
    const commissions = await this.commissionsBreakdown(f, range);

    const live: Record<string, number> = { total: 0 };
    for (const s of ACTIVE_STATUSES) live[s] = 0;
    for (const row of liveRows) {
      live[row.status] = this.n(row.n);
      live.total += this.n(row.n);
    }

    const cancellations: Record<string, number> = { RIDER: 0, DRIVER: 0, SYSTEM: 0 };
    for (const row of cancelRows) cancellations[row.by] = this.n(row.n);

    return {
      message: this.t('ride.admin.dashboard', lang),
      data: {
        period: { from: range.from, to: range.to, groupBy },
        filters: f,

        overview: {
          totalRides,
          completed,
          cancelled: cancelledCount,
          inProgress,
          byStatus,
          /** % de courses terminées parmi les courses finies (terminées + annulées) */
          completionRate: finished ? Math.round((completed / finished) * 1000) / 10 : 0,
          cancellationRate: finished ? Math.round((cancelledCount / finished) * 1000) / 10 : 0,
          activeDrivers: this.n(perfRow?.activeDrivers),
          activeRiders: this.n(perfRow?.activeRiders),
        },

        /** Chiffres par devise (courses terminées) */
        revenue: revenueRows.map((r) => ({
          currency: r.currency,
          completedRides: this.n(r.rides),
          gross: this.r2(r.gross),
          commission: this.r2(r.commission),
          driverEarnings: this.r2(r.driverEarnings),
          associationCommission: this.r2(r.associationCommission),
          transactionFees: this.r2(r.transactionFees),
          averagePrice: this.r2(r.averagePrice),
          paidRides: this.n(r.paidRides),
          paidAmount: this.r2(r.paidAmount),
          unpaidAmount: this.r2(r.unpaidAmount),
          /** Encaissé par les chauffeurs (espèces, carte) */
          collectedByDrivers: this.r2(r.collectedByDrivers),
          /** Encaissé dans l'application (Mobile Money, F-Pay, virement…) */
          collectedInApp: this.r2(r.collectedInApp),
        })),

        paymentMethods: methodRows.map((m) => ({
          method: m.method,
          currency: m.currency,
          rides: this.n(m.rides),
          gross: this.r2(m.gross),
          paidRides: this.n(m.paidRides),
        })),

        cancellations,

        performance: {
          avgDistanceKm: this.r2(perfRow?.avgDistanceKm),
          totalDistanceKm: this.r2(perfRow?.totalDistanceKm),
          avgDurationMin: this.r2(perfRow?.avgDurationMin),
          /** Temps moyen avant qu'un chauffeur accepte (minutes) */
          avgAcceptMin: this.r2(this.n(perfRow?.avgAcceptSeconds) / 60),
          /** Temps moyen pour arriver au passager (minutes) */
          avgPickupMin: this.r2(this.n(perfRow?.avgPickupSeconds) / 60),
          /** Durée moyenne du trajet (minutes) */
          avgTripMin: this.r2(this.n(perfRow?.avgTripSeconds) / 60),
          avgDriverRating: perfRow?.avgDriverRating != null ? this.r2(perfRow.avgDriverRating) : null,
          driverRatings: this.n(perfRow?.driverRatings),
          avgRiderRating: perfRow?.avgRiderRating != null ? this.r2(perfRow.avgRiderRating) : null,
        },

        timeline,

        topDrivers: driverRows.map((d) => ({
          driverId: d.driverId,
          fullName: d.fullName ?? null,
          phone: d.phone ?? null,
          image: d.image ?? null,
          rides: this.n(d.rides),
          completed: this.n(d.completed),
          cancelledByDriver: this.n(d.cancelledByDriver),
          rating: d.rating != null ? this.r2(d.rating) : null,
          distanceKm: this.r2(d.distanceKm),
          revenue: driverMoney
            .filter((m) => m.driverId === d.driverId)
            .map((m) => ({
              currency: m.currency,
              gross: this.r2(m.gross),
              commission: this.r2(m.commission),
              earnings: this.r2(m.earnings),
            })),
        })),

        cities: cityRows.map((c) => ({
          cityId: c.cityId,
          name: c.name ?? null,
          rides: this.n(c.rides),
          completed: this.n(c.completed),
          cancelled: this.n(c.cancelled),
        })),

        categories: categoryRows.map((c) => ({
          categoryId: c.categoryId,
          name: c.name ?? null,
          rides: this.n(c.rides),
          completed: this.n(c.completed),
          cancelled: this.n(c.cancelled),
        })),

        /** Courses en cours MAINTENANT (hors période) */
        live,

        /**
         * ✅ Toutes les commissions, par devise puis par moyen de paiement (courses terminées).
         * commissionCollected = commission des courses PAYÉES (espèces : confirmées par le chauffeur) ;
         * commissionPending   = commission des courses terminées pas encore payées / confirmées.
         * Espèces : debitedFromDrivers / creditedToTaxi = suivi du débit des gains et du crédit F-Pay TAXI.
         */
        commissions,

        /** Commissions des courses en espèces débitées des gains des chauffeurs, créditées au compte TAXI */
        cashCommissions: cashRows.map((c) => ({
          currency: c.currency,
          rides: this.n(c.rides),
          debited: this.r2(c.debited),
          creditedToTaxi: this.r2(c.credited),
          creditFailed: this.n(c.failed),
          creditFailedAmount: this.r2(c.failedAmount),
        })),
      },
    };
  }

  /** ✅ Commissions par devise → par moyen de paiement (mêmes filtres que le tableau de bord) */
  private async commissionsBreakdown(f: RideAdminFilterDto, range: { from: Date; to: Date }) {
    const cur = this.curExpr;
    const g = this.gross;
    const done = RideStatus.COMPLETED;
    const paid = RidePaymentStatus.PAID;
    const methodExpr = "UPPER(COALESCE(r.paymentMethod, 'CASH'))";

    const [rows, cashRows] = await Promise.all([
      this.base(f, range)
        .andWhere('r.status = :done', { done })
        .select(cur, 'currency')
        .addSelect(methodExpr, 'method')
        .addSelect('COUNT(*)', 'rides')
        .addSelect(`SUM(${g})`, 'gross')
        .addSelect('SUM(COALESCE(r.commissionAmount, 0))', 'commission')
        .addSelect('SUM(COALESCE(r.associationCommissionAmount, 0))', 'associationCommission')
        .addSelect('SUM(COALESCE(r.transactionFee, 0))', 'transactionFees')
        .addSelect('SUM(COALESCE(r.driverEarning, 0))', 'driverEarnings')
        .addSelect(`SUM(CASE WHEN r.paymentStatus = '${paid}' THEN 1 ELSE 0 END)`, 'paidRides')
        .addSelect(`SUM(CASE WHEN r.paymentStatus = '${paid}' THEN COALESCE(r.commissionAmount, 0) ELSE 0 END)`, 'commissionOnPaid')
        .addSelect('AVG(r.commissionRate)', 'avgRate')
        .groupBy(cur)
        .addGroupBy(methodExpr)
        .getRawMany(),

      // Commissions espèces débitées des gains (table driver_wallet_movements)
      this.base(f, range)
        .andWhere('r.status = :done', { done })
        .innerJoin(DriverWalletMovement, 'mv', "mv.rideId = r.id AND mv.type IN ('CASH_COMMISSION', 'CASH_COMMISSION_FPAY')")
        .select(cur, 'currency')
        .addSelect(methodExpr, 'method')
        .addSelect('SUM(-mv.amount)', 'debited')
        .addSelect("SUM(CASE WHEN mv.taxiCreditStatus = 'SUCCESS' THEN -mv.amount ELSE 0 END)", 'credited')
        .groupBy(cur)
        .addGroupBy(methodExpr)
        .getRawMany()
        .catch(() => [] as any[]), // table pas encore créée
    ]);

    const collectedByDriver = (m: string) => RIDE_DRIVER_COLLECTED_METHODS.includes(m);
    const byCurrency = new Map<string, any>();

    for (const r of rows) {
      const method = String(r.method);
      const cash = cashRows.find((c) => c.currency === r.currency && c.method === method);
      const commission = this.r2(r.commission);
      const gross = this.r2(r.gross);
      const viaDriver = collectedByDriver(method);
      // ✅ Commission récupérée dès que la course est PAYÉE (espèces : dès que le chauffeur a confirmé)
      const collected = this.r2(this.n(r.commissionOnPaid));
      const line = {
        method,
        /** APP : l'argent passe par l'application ; DRIVER : encaissé par le chauffeur */
        collectedBy: viaDriver ? 'DRIVER' : 'APP',
        rides: this.n(r.rides),
        paidRides: this.n(r.paidRides),
        gross,
        commission,
        /** Commission moyenne (% du montant) */
        commissionPercent: gross > 0 ? Math.round((commission / gross) * 1000) / 10 : 0,
        avgCommissionRate: r.avgRate != null ? this.r2(r.avgRate) : null,
        associationCommission: this.r2(r.associationCommission),
        transactionFees: this.r2(r.transactionFees),
        driverEarnings: this.r2(r.driverEarnings),
        commissionCollected: collected,
        commissionPending: this.r2(Math.max(0, commission - collected)),
        /** Espèces : commission débitée des gains du chauffeur (validations depuis la mise en place du débit) */
        debitedFromDrivers: viaDriver ? this.r2(cash?.debited) : null,
        /** Espèces : commission créditée au compte F-Pay TAXI */
        creditedToTaxi: viaDriver ? this.r2(cash?.credited) : null,
      };

      const c = byCurrency.get(r.currency) ?? {
        currency: r.currency,
        rides: 0,
        gross: 0,
        commission: 0,
        associationCommission: 0,
        transactionFees: 0,
        driverEarnings: 0,
        commissionCollected: 0,
        commissionPending: 0,
        byPaymentMethod: [] as any[],
      };
      c.rides += line.rides;
      c.gross += line.gross;
      c.commission += line.commission;
      c.associationCommission += line.associationCommission;
      c.transactionFees += line.transactionFees;
      c.driverEarnings += line.driverEarnings;
      c.commissionCollected += line.commissionCollected;
      c.commissionPending += line.commissionPending;
      c.byPaymentMethod.push(line);
      byCurrency.set(r.currency, c);
    }

    return [...byCurrency.values()]
      .sort((a, b) => String(a.currency).localeCompare(String(b.currency)))
      .map((c) => ({
        currency: c.currency,
        rides: c.rides,
        gross: this.r2(c.gross),
        commission: this.r2(c.commission),
        commissionPercent: c.gross > 0 ? Math.round((c.commission / c.gross) * 1000) / 10 : 0,
        associationCommission: this.r2(c.associationCommission),
        transactionFees: this.r2(c.transactionFees),
        driverEarnings: this.r2(c.driverEarnings),
        commissionCollected: this.r2(c.commissionCollected),
        commissionPending: this.r2(c.commissionPending),
        byPaymentMethod: c.byPaymentMethod.sort((a: any, b: any) => b.commission - a.commission),
      }));
  }

  /** Commissions espèces : même période, même chauffeur, même devise */
  private cashSummaryQuery(f: RideAdminFilterDto, range: { from: Date; to: Date }) {
    const qb = this.movementRepo
      .createQueryBuilder('m')
      .select('m.currency', 'currency')
      .addSelect('COUNT(*)', 'rides')
      .addSelect('SUM(-m.amount)', 'debited')
      .addSelect("SUM(CASE WHEN m.taxiCreditStatus = 'SUCCESS' THEN -m.amount ELSE 0 END)", 'credited')
      .addSelect("SUM(CASE WHEN m.taxiCreditStatus = 'FAILED' THEN 1 ELSE 0 END)", 'failed')
      .addSelect("SUM(CASE WHEN m.taxiCreditStatus = 'FAILED' THEN -m.amount ELSE 0 END)", 'failedAmount')
      .where("m.type IN ('CASH_COMMISSION', 'CASH_COMMISSION_FPAY')")
      .andWhere('m.createdAt BETWEEN :from AND :to', { from: range.from, to: range.to });
    if (f.driverId) qb.andWhere('m.driverId = :driverId', { driverId: f.driverId });
    if (f.currency) qb.andWhere('m.currency = :currency', { currency: f.currency });
    // Table absente (script SQL pas encore lancé) : le tableau de bord reste utilisable
    return qb.groupBy('m.currency').orderBy('m.currency', 'ASC').getRawMany().catch(() => [] as any[]);
  }

  // ============================================================
  // 📋 LISTE DES COURSES
  // ============================================================
  async list(q: RideAdminListQueryDto, lang = 'fr') {
    const range = this.period(q, lang);
    const page = Math.max(1, q.page || 1);
    const limit = Math.min(200, Math.max(1, q.limit || 20));
    const sortCol =
      q.sortBy === 'price' ? this.gross : q.sortBy === 'distance' ? 'r.distance' : q.sortBy === 'completedAt' ? 'r.completedAt' : 'r.createdAt';

    const qb = this.base(q, range)
      .leftJoin('r.driver', 'd')
      .leftJoin('r.rider', 'u')
      .leftJoin('r.city', 'ci')
      .leftJoin('r.category', 'ca');

    const total = await qb.clone().getCount();

    const rows = await qb
      .select([
        'r.id AS id',
        'r.status AS status',
        'r.createdAt AS createdAt',
        'r.acceptedAt AS acceptedAt',
        'r.startedAt AS startedAt',
        'r.completedAt AS completedAt',
        'r.cancelledAt AS cancelledAt',
        'r.cancelledBy AS cancelledBy',
        'r.cancellationReason AS cancellationReason',
        'r.pickupLocation AS pickupLocation',
        'r.dropoffLocation AS dropoffLocation',
        'r.distance AS distance',
        'r.duration AS duration',
        'r.price AS price',
        'r.finalPrice AS finalPrice',
        `${this.curExpr} AS currency`,
        'r.commissionRate AS commissionRate',
        'r.commissionAmount AS commissionAmount',
        'r.driverEarning AS driverEarning',
        'r.associationId AS associationId',
        'r.associationCommissionAmount AS associationCommissionAmount',
        'r.transactionFee AS transactionFee',
        'r.totalToPay AS totalToPay',
        "UPPER(COALESCE(r.paymentMethod, 'CASH')) AS paymentMethod",
        'r.paymentStatus AS paymentStatus',
        'r.paidAt AS paidAt',
        'r.paymentReference AS paymentReference',
        'r.driverRating AS driverRating',
        'r.riderRating AS riderRating',
        'r.driverId AS driverId',
        'd.fullName AS driverName',
        'd.phone AS driverPhone',
        'd.image AS driverImage',
        'r.riderId AS riderId',
        'u.fullName AS riderName',
        'u.phone AS riderPhone',
        'r.cityId AS cityId',
        'ci.name AS cityName',
        'r.categoryId AS categoryId',
        'ca.name AS categoryName',
      ])
      .orderBy(sortCol, q.sortDir === 'ASC' ? 'ASC' : 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    const parse = (v: any) => {
      if (v == null || typeof v === 'object') return v ?? null;
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    };
    const num = (v: any) => (v == null ? null : this.r2(v));

    const data = rows.map((r) => ({
      id: r.id,
      reference: String(r.id).slice(0, 8).toUpperCase(),
      status: r.status,
      createdAt: r.createdAt,
      acceptedAt: r.acceptedAt,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      cancelledAt: r.cancelledAt,
      cancelledBy: r.cancelledBy,
      cancellationReason: r.cancellationReason,
      pickup: parse(r.pickupLocation),
      dropoff: parse(r.dropoffLocation),
      distanceKm: num(r.distance),
      durationMin: num(r.duration),
      amount: num(r.finalPrice ?? r.price),
      price: num(r.price),
      finalPrice: num(r.finalPrice),
      currency: r.currency,
      commissionRate: num(r.commissionRate),
      commissionAmount: num(r.commissionAmount),
      driverEarning: num(r.driverEarning),
      associationId: r.associationId,
      associationCommissionAmount: num(r.associationCommissionAmount),
      transactionFee: num(r.transactionFee),
      totalToPay: num(r.totalToPay),
      paymentMethod: r.paymentMethod,
      paymentStatus: r.paymentStatus,
      paidAt: r.paidAt,
      paymentReference: r.paymentReference,
      driverRating: r.driverRating != null ? Number(r.driverRating) : null,
      riderRating: r.riderRating != null ? Number(r.riderRating) : null,
      driver: r.driverId ? { id: r.driverId, fullName: r.driverName, phone: r.driverPhone, image: r.driverImage } : null,
      rider: r.riderId ? { id: r.riderId, fullName: r.riderName, phone: r.riderPhone } : null,
      city: r.cityId ? { id: r.cityId, name: r.cityName } : null,
      category: r.categoryId ? { id: r.categoryId, name: r.categoryName } : null,
    }));

    return {
      message: this.t('ride.admin.list', lang),
      data: {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================================
  // 🚖 CHAUFFEURS (sélecteur du filtre)
  // ============================================================
  async drivers(q: RideAdminDriversQueryDto, lang = 'fr') {
    const limit = Math.min(200, Math.max(1, q.limit || 50));
    const params: any[] = [];
    let searchCond = '';
    if (q.search) {
      const s = `%${q.search.toLowerCase()}%`;
      const phone = `%${q.search.replace(/[\s+]/g, '')}%`;
      searchCond = "AND (LOWER(u.fullName) LIKE ? OR REPLACE(REPLACE(COALESCE(u.phone, ''), ' ', ''), '+', '') LIKE ?)";
      params.push(s, phone);
    }
    const rows: any[] = await this.rideRepo.query(
      `SELECT u.id, u.fullName, u.phone, u.image, u.isActive,
              COUNT(r.id) AS rides,
              SUM(CASE WHEN r.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
              MAX(r.createdAt) AS lastRideAt
         FROM users u
         LEFT JOIN rides r ON r.driverId = u.id
        WHERE u.deleted = 0
          AND (u.role = 'DRIVER' OR r.id IS NOT NULL)
          ${searchCond}
        GROUP BY u.id, u.fullName, u.phone, u.image, u.isActive
        ORDER BY rides DESC, u.fullName ASC
        LIMIT ${limit}`,
      params,
    );
    return {
      message: this.t('ride.admin.drivers', lang),
      data: rows.map((d) => ({
        id: d.id,
        fullName: d.fullName,
        phone: d.phone,
        image: d.image,
        isActive: !!Number(d.isActive),
        rides: this.n(d.rides),
        completed: this.n(d.completed),
        lastRideAt: d.lastRideAt,
      })),
    };
  }

  // ============================================================
  // 💵 COMMISSIONS DES COURSES EN ESPÈCES
  // ============================================================
  async cashCommissions(q: RideCashCommissionQueryDto, lang = 'fr') {
    const range = this.period(q, lang);
    const page = Math.max(1, q.page || 1);
    const limit = Math.min(200, Math.max(1, q.limit || 20));

    const qb = this.movementRepo
      .createQueryBuilder('m')
      .leftJoin(UserEntity, 'u', 'u.id = m.driverId')
      .where("m.type IN ('CASH_COMMISSION', 'CASH_COMMISSION_FPAY')")
      .andWhere('m.createdAt BETWEEN :from AND :to', { from: range.from, to: range.to });
    if (q.driverId) qb.andWhere('m.driverId = :driverId', { driverId: q.driverId });
    if (q.currency) qb.andWhere('m.currency = :currency', { currency: q.currency });
    if (q.taxiCreditStatus) qb.andWhere('m.taxiCreditStatus = :st', { st: q.taxiCreditStatus });

    const total = await qb.clone().getCount();
    const rows = await qb
      .select([
        'm.id AS id',
        'm.rideId AS rideId',
        'm.driverId AS driverId',
        'u.fullName AS driverName',
        'u.phone AS driverPhone',
        'm.currency AS currency',
        'm.amount AS amount',
        'm.description AS description',
        'm.taxiCreditStatus AS taxiCreditStatus',
        'm.taxiTransactionId AS taxiTransactionId',
        'm.taxiReference AS taxiReference',
        'm.taxiCreditError AS taxiCreditError',
        'm.taxiCreditAttempts AS taxiCreditAttempts',
        'm.taxiCreditedAt AS taxiCreditedAt',
        'm.createdAt AS createdAt',
      ])
      .orderBy('m.createdAt', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    return {
      message: this.t('ride.admin.cash_commissions', lang),
      data: {
        data: rows.map((m) => ({
          ...m,
          amount: this.r2(Math.abs(this.n(m.amount))),
          rideReference: m.rideId ? String(m.rideId).slice(0, 8).toUpperCase() : null,
          taxiCreditAttempts: this.n(m.taxiCreditAttempts),
          driver: { id: m.driverId, fullName: m.driverName, phone: m.driverPhone },
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
