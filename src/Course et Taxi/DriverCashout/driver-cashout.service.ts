import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager, LessThan, MoreThan, Repository } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { FpayService } from 'src/fpay/fpay.service';
import { I18nService } from 'src/libs/common/src';
import { NotificationType } from 'src/notification/type/notification.type';
import { UserPaymentMethodsService } from 'src/users/payment-methods/user-payment-methods.service';
import { Ride } from '../Ride/entity/Ride.entity';
import { RideStatus } from '../Ride/enum/RideStatus.enum';
import { RIDE_DRIVER_COLLECTED_METHODS, RidePaymentStatus } from '../Ride/enum/ride-event.enum';
import { RideRealtimeService } from '../Ride/ride-realtime.service';
import { CASHOUT_RESERVED_STATUSES, DriverCashout, DriverCashoutDestination, DriverCashoutStatus } from './entity/driver-cashout.entity';
import { DriverWallet } from './entity/driver-wallet.entity';
import { DriverWalletMovement, DriverWalletMovementType } from './entity/driver-wallet-movement.entity';
import { ensureDriverWallet } from './driver-wallet.util';
import { DriverCashoutDto, DriverCashoutQueryDto, DriverEarningsSummaryQueryDto, ResolveDriverCashoutDto } from './dto/driver-cashout.dto';

const ADMIN_ROLES: string[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
/** Un retrait resté PROCESSING au-delà (serveur redémarré pendant l'appel) passe en UNKNOWN : à vérifier */
const STALE_PROCESSING_MINUTES = 10;
/** Même montant, même numéro, dans ce délai, sans clé d'idempotence : considéré comme une répétition */
const DUPLICATE_WINDOW_SECONDS = 120;

/**
 * ✅ Retrait des gains du chauffeur via F-Pay (route `taxi/driver/cashout`, service FpayService existant).
 *
 *  Solde disponible (par devise) =
 *      gains (driverEarning) des courses TERMINÉES et PAYÉES dans l'application (Mobile Money, FPay, virement, manuel)
 *    − commission due sur les courses payées en espèces / carte (si DRIVER_CASHOUT_DEDUCT_CASH_COMMISSION=true)
 *    − commissions des courses en espèces débitées à la validation (table driver_wallet_movements)
 *    − retraits PROCESSING, SUCCESS et UNKNOWN.
 *  Si le résultat est négatif : disponible = 0 et `debt` = montant dû (remboursé par les prochaines courses).
 *  Les courses en espèces / carte ne sont pas retirables : le chauffeur a déjà encaissé l'argent.
 *
 *  Anti-doublon :
 *    1. verrou par chauffeur (SELECT … FOR UPDATE) : deux demandes simultanées sont traitées l'une après l'autre ;
 *    2. clé d'idempotence (Idempotency-Key / requestId), unique par chauffeur en base : la même clé renvoie le même retrait ;
 *    3. un seul retrait PROCESSING à la fois ; même montant + même numéro dans les 2 minutes = répétition ;
 *    4. jamais de renvoi automatique d'un retrait sans réponse (UNKNOWN) : un administrateur vérifie dans F-Pay.
 */
@Injectable()
export class DriverCashoutService {
  private readonly logger = new Logger(DriverCashoutService.name);
  /** Coupe-circuit : PIN du compte TAXI refusé par F-Pay → retraits suspendus (évite le blocage du compte TAXI) */
  private pinRejectedUntil = 0;

  constructor(
    @InjectRepository(DriverCashout) private readonly cashoutRepo: Repository<DriverCashout>,
    @InjectRepository(DriverWallet) private readonly walletRepo: Repository<DriverWallet>,
    @InjectRepository(Ride) private readonly rideRepo: Repository<Ride>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly fpay: FpayService,
    private readonly paymentMethods: UserPaymentMethodsService,
    private readonly realtime: RideRealtimeService,
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
  ) { }

  // ============================================================
  // OUTILS
  // ============================================================
  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.i18n.translate(key, lang, params);
  }

  private round2(n: number) {
    return Math.round(Number(n || 0) * 100) / 100;
  }

  private isAdmin(user?: UserEntity | null) {
    if (!user) return false;
    const roles: string[] = [(user as any).role, ...(((user as any).roles as string[]) || [])].filter(Boolean);
    return roles.some((r) => ADMIN_ROLES.includes(r));
  }

  private defaultCurrency(): string {
    return String(this.config.get<string>('RIDE_PRICING_CURRENCY') || 'USD').toUpperCase();
  }

  private deductCashCommission(): boolean {
    return String(this.config.get<string>('DRIVER_CASHOUT_DEDUCT_CASH_COMMISSION') || 'false').toLowerCase() === 'true';
  }

  /** Minimum de retrait par devise : DRIVER_CASHOUT_MIN_USD=1, DRIVER_CASHOUT_MIN_CDF=2000… */
  private minAmount(currency: string): number {
    const v = Number(this.config.get<string>(`DRIVER_CASHOUT_MIN_${currency}`) || 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  /**
   * ✅ Devises retirables : DRIVER_CASHOUT_CURRENCIES=USD,CDF (défaut USD,CDF).
   * Le wallet TAXI à débiter est choisi PAR F-PAY selon la devise (wallet TAXI de la même devise) :
   * plus besoin d'identifiant de wallet TAXI côté Favor Help.
   */
  private cashoutCurrencies(): string[] {
    const raw = String(this.config.get<string>('DRIVER_CASHOUT_CURRENCIES') || 'USD,CDF');
    return [...new Set(raw.split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x)))].sort();
  }

  /** ✅ Retrait possible dans cette devise */
  private walletConfigured(currency: string): boolean {
    return this.cashoutCurrencies().includes(String(currency).toUpperCase());
  }

  private assertCurrency(currency: string, lang: string) {
    if (!this.walletConfigured(currency)) throw new BadRequestException(this.t('ride.cashout.currency_not_supported', lang, { currency }));
  }

  private reference() {
    return `DCO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }

  private mask(phone?: string | null) {
    if (!phone) return null;
    return `${phone.slice(0, 4)}${'*'.repeat(Math.max(0, phone.length - 7))}${phone.slice(-3)}`;
  }

  /** Montant net envoyé au Mobile Money, lu dans la réponse F-Pay (« Net reçu: 97.00 ») */
  private netReceived(c: DriverCashout): number | null {
    const tx = c.fpayResponse?.data?.transaction;
    const text = `${tx?.description ?? ''} ${c.fpayMessage ?? ''}`;
    const m = text.match(/\bnet\b\s*(?:re[çc]u|received|amount)?\s*:?\s*([0-9]+(?:[.,][0-9]+)?)/i);
    const n = m ? Number(m[1].replace(',', '.')) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Réponse renvoyée au chauffeur */
  private view(c: DriverCashout, extra: Record<string, any> = {}) {
    return {
      id: c.id,
      reference: c.reference,
      status: c.status,
      amount: Number(c.amount),
      currency: c.currency,
      /** MOBILE_MONEY ou FPAY (compte F-Pay du chauffeur, même devise) */
      destination: c.destination || DriverCashoutDestination.MOBILE_MONEY,
      provider: c.provider,
      phone: this.mask(c.phone),
      /** ✅ Montant reçu sur le Mobile Money : F-Pay retire ses frais Pawapay du montant (ex. 100 → 97 net) */
      netReceived: this.netReceived(c),
      fpay: {
        transactionId: c.fpayTransactionId ?? null,
        reference: c.fpayReference ?? null,
        externalReference: c.fpayExternalReference ?? null,
        status: c.fpayStatus ?? null,
        currency: c.fpayCurrency ?? null,
        message: c.fpayMessage ?? null,
      },
      failureReason: c.failureReason ?? null,
      requestId: c.requestId ?? null,
      createdAt: c.createdAt,
      completedAt: c.completedAt ?? null,
      ...extra,
    };
  }

  // ============================================================
  // SOLDE
  // ============================================================
  /** Soldes par devise (lus avec `m` : à l'intérieur de la transaction verrouillée lors d'un retrait) */
  private async computeBalances(m: EntityManager, driverId: string) {
    // Devise par défaut écrite en clair (A-Z uniquement) : même expression dans SELECT et GROUP BY (ONLY_FULL_GROUP_BY)
    const def = this.defaultCurrency().replace(/[^A-Z]/g, '') || 'USD';
    const curExpr = `UPPER(COALESCE(r.currency, '${def}'))`;
    const earned: any[] = await m
      .createQueryBuilder(Ride, 'r')
      .select(curExpr, 'currency')
      .addSelect('COALESCE(SUM(r.driverEarning), 0)', 'amount')
      .addSelect('COUNT(*)', 'rides')
      .where('r.driverId = :driverId', { driverId })
      .andWhere('r.status = :done', { done: RideStatus.COMPLETED })
      .andWhere('r.paymentStatus = :paid', { paid: RidePaymentStatus.PAID })
      .andWhere('(r.paymentMethod IS NULL OR r.paymentMethod NOT IN (:...collected))', { collected: RIDE_DRIVER_COLLECTED_METHODS })
      .andWhere('r.driverEarning > 0')
      .groupBy(curExpr)
      .getRawMany();

    const cash: any[] = await m
      .createQueryBuilder(Ride, 'r')
      .select(curExpr, 'currency')
      .addSelect('COALESCE(SUM(r.commissionAmount), 0)', 'commission')
      .addSelect('COUNT(*)', 'rides')
      .where('r.driverId = :driverId', { driverId })
      .andWhere('r.status = :done', { done: RideStatus.COMPLETED })
      .andWhere('r.paymentStatus = :paid', { paid: RidePaymentStatus.PAID })
      .andWhere('r.paymentMethod IN (:...collected)', { collected: RIDE_DRIVER_COLLECTED_METHODS })
      .groupBy(curExpr)
      .getRawMany();

    const withdrawn: any[] = await m
      .createQueryBuilder(DriverCashout, 'c')
      .select('c.currency', 'currency')
      .addSelect('c.status', 'status')
      .addSelect('COALESCE(SUM(c.amount), 0)', 'amount')
      .where('c.driverId = :driverId', { driverId })
      .andWhere('c.status IN (:...st)', { st: CASHOUT_RESERVED_STATUSES })
      .groupBy('c.currency')
      .addGroupBy('c.status')
      .getRawMany();

    // ✅ Mouvements (commissions des courses en espèces débitées des gains).
    //    Avec DRIVER_CASHOUT_DEDUCT_CASH_COMMISSION=true, TOUTES les commissions espèces sont déjà déduites ci-dessous :
    //    on ne compte pas une deuxième fois celles enregistrées en mouvement.
    const movements: any[] = await m
      .createQueryBuilder(DriverWalletMovement, 'mv')
      .select('UPPER(mv.currency)', 'currency')
      .addSelect('COALESCE(SUM(mv.amount), 0)', 'amount')
      .addSelect(`COALESCE(SUM(CASE WHEN mv.type = '${DriverWalletMovementType.CASH_COMMISSION}' THEN -mv.amount ELSE 0 END), 0)`, 'cashCommission')
      .where('mv.driverId = :driverId', { driverId })
      .andWhere(this.deductCashCommission() ? `mv.type <> '${DriverWalletMovementType.CASH_COMMISSION}'` : '1 = 1')
      .groupBy('UPPER(mv.currency)')
      .getRawMany()
      .catch(() => [] as any[]); // table pas encore créée : comportement d'avant

    // ✅ Portefeuilles déjà créés (même sans gain encore payé : affichés à 0)
    const walletRows: { currency: string; status: string }[] = await m
      .createQueryBuilder(DriverWallet, 'w')
      .select('UPPER(w.currency)', 'currency')
      .addSelect('w.status', 'status')
      .where('w.driverId = :driverId', { driverId })
      .getRawMany();

    const currencies = new Set<string>([
      ...earned.map((e) => e.currency),
      ...withdrawn.map((w) => w.currency),
      ...cash.map((c) => c.currency),
      ...walletRows.map((w) => w.currency),
      ...movements.map((mv) => mv.currency),
    ]);
    const deduct = this.deductCashCommission();
    return [...currencies].sort().map((currency) => {
      const e = earned.find((x) => x.currency === currency);
      const c = cash.find((x) => x.currency === currency);
      const sumStatus = (st: string) => this.round2(withdrawn.filter((w) => w.currency === currency && w.status === st).reduce((s, w) => s + Number(w.amount), 0));
      const earnedAmount = this.round2(e?.amount);
      const commissionDue = this.round2(c?.commission);
      const withdrawnAmount = sumStatus(DriverCashoutStatus.SUCCESS);
      const processing = sumStatus(DriverCashoutStatus.PROCESSING);
      const toVerify = sumStatus(DriverCashoutStatus.UNKNOWN);
      const mv = movements.find((x) => x.currency === currency);
      const movementsAmount = this.round2(mv?.amount);
      /** Solde réel (peut être négatif = dette du chauffeur) */
      const balance = this.round2(earnedAmount + movementsAmount - (deduct ? commissionDue : 0) - withdrawnAmount - processing - toVerify);
      const available = this.round2(Math.max(0, balance));
      return {
        currency,
        /** ✅ Montant retirable maintenant */
        available,
        /** Gains des courses payées dans l'application */
        earned: earnedAmount,
        paidRides: Number(e?.rides || 0),
        /** Déjà retiré avec succès */
        withdrawn: withdrawnAmount,
        /** Retrait en cours d'envoi */
        processing,
        /** Retrait sans réponse de F-Pay, en vérification (montant réservé) */
        underVerification: toVerify,
        /** Courses payées en espèces / carte : argent déjà encaissé par le chauffeur */
        cashRides: Number(c?.rides || 0),
        cashCommissionDue: commissionDue,
        cashCommissionDeducted: deduct,
        /** ✅ Commissions espèces débitées des gains à la validation de la course */
        cashCommissionDebited: this.round2(mv?.cashCommission),
        /** ✅ Solde réel (négatif = dette) */
        balance,
        /** ✅ Montant dû par le chauffeur (commissions espèces non encore couvertes par ses gains) */
        debt: this.round2(Math.max(0, -balance)),
        minAmount: this.minAmount(currency),
        /** Portefeuille bloqué par l'administration : retrait refusé dans cette devise */
        walletBlocked: walletRows.some((w) => w.currency === currency && String(w.status).toUpperCase() === 'BLOCKED'),
        /** ✅ Retrait possible dans CETTE devise (gains CDF → retrait en CDF, gains USD → retrait en USD) */
        cashoutEnabled: this.walletConfigured(currency),
      };
    });
  }

  async balance(user: UserEntity, lang = 'fr') {
    const balances = await this.syncWallets(user.id);
    const fpayAccount = await this.fpayAccountOf(user.id);
    return {
      message: this.t('ride.cashout.balance', lang),
      data: {
        balances,
        /** ✅ Portefeuilles du chauffeur, un par devise */
        wallets: await this.walletViews(user.id, balances),
        /** ✅ Le retrait se fait UNIQUEMENT vers le compte F-Pay du chauffeur (wallet F-Pay de la même devise) */
        fpayAccount: {
          enabled: true,
          linked: !!fpayAccount,
          phone: fpayAccount?.phone ? this.mask(fpayAccount.phone) : null,
        },
        destinations: ['FPAY'],
        /** Devises retirables (un retrait se fait toujours dans la devise des gains) */
        cashoutCurrencies: this.cashoutCurrencies(),
        defaultDestination: null,
      },
    };
  }

  // ============================================================
  // PORTEFEUILLES PAR DEVISE
  // ============================================================
  /**
   * ✅ Crée les portefeuilles manquants (une devise de course = un portefeuille) puis met à jour leurs soldes
   * (copie de computeBalances). Renvoie les soldes par devise.
   */
  private async syncWallets(driverId: string) {
    const m = this.dataSource.manager;
    // Devises des courses du chauffeur (toutes, même non payées) → portefeuilles
    const def = this.defaultCurrency().replace(/[^A-Z]/g, '') || 'USD';
    const rideCurrencies: { currency: string; rides: string; firstRideId: string }[] = await this.rideRepo
      .createQueryBuilder('r')
      .select(`UPPER(COALESCE(r.currency, '${def}'))`, 'currency')
      .addSelect('SUM(CASE WHEN r.status = :done THEN 1 ELSE 0 END)', 'rides')
      .addSelect('MIN(r.id)', 'firstRideId')
      .where('r.driverId = :driverId', { driverId })
      .setParameter('done', RideStatus.COMPLETED)
      .groupBy(`UPPER(COALESCE(r.currency, '${def}'))`)
      .getRawMany();
    for (const rc of rideCurrencies) await ensureDriverWallet(m, driverId, rc.currency, rc.firstRideId).catch(() => undefined);

    const balances = await this.computeBalances(m, driverId);
    const now = new Date();
    await Promise.all(
      balances.map((b) =>
        this.walletRepo
          .update(
            { driverId, currency: b.currency },
            {
              earned: b.earned as any,
              withdrawn: b.withdrawn as any,
              available: b.available as any,
              ridesCount: Number(rideCurrencies.find((r) => r.currency === b.currency)?.rides || 0),
              lastSyncedAt: now,
            },
          )
          .catch(() => undefined),
      ),
    );
    return balances;
  }

  /** Portefeuilles du chauffeur (un par devise) avec leur solde */
  private async walletViews(driverId: string, balances: Awaited<ReturnType<DriverCashoutService['computeBalances']>>) {
    const rows = await this.walletRepo.find({ where: { driverId }, order: { createdAt: 'ASC' } });
    return rows.map((w) => {
      const b = balances.find((x) => x.currency === w.currency);
      return {
        id: w.id,
        currency: w.currency,
        status: w.status,
        available: b?.available ?? (Number(w.available) || 0),
        earned: b?.earned ?? (Number(w.earned) || 0),
        withdrawn: b?.withdrawn ?? (Number(w.withdrawn) || 0),
        processing: b?.processing ?? 0,
        underVerification: b?.underVerification ?? 0,
        ridesCount: w.ridesCount,
        minAmount: this.minAmount(w.currency),
        /** Retrait possible dans cette devise (wallet F-Pay TAXI configuré, portefeuille actif) */
        cashoutEnabled: String(w.status).toUpperCase() !== 'BLOCKED' && this.walletConfigured(w.currency),
        createdAt: w.createdAt,
      };
    });
  }

  /** GET /rides/driver/earnings/wallets */
  async wallets(user: UserEntity, lang = 'fr') {
    const balances = await this.syncWallets(user.id);
    return { message: this.t('ride.cashout.wallets', lang), data: await this.walletViews(user.id, balances) };
  }

  // ============================================================
  // COMPTE F-PAY DU CHAUFFEUR (seule destination des retraits)
  // ============================================================
  /** Compte F-Pay lié au compte Favor Help du chauffeur (users.userIdFpay + isLink) */
  private async fpayAccountOf(userId: string): Promise<{ fpayUserId: string; phone: string | null } | null> {
    const u = await this.userRepo.findOne({ where: { id: userId } });
    const fpayUserId = (u as any)?.userIdFpay ? String((u as any).userIdFpay) : '';
    if (!fpayUserId || (u as any)?.isLink === false) return null;
    return { fpayUserId, phone: String((u as any)?.phone || '').replace(/\D/g, '') || null };
  }

  /** Wallets F-Pay du chauffeur (lus dans F-Pay) ; null si F-Pay ne répond pas */
  private async readFpayWallets(fpayUserId: string) {
    try {
      return await this.fpay.userFpayWallets(fpayUserId);
    } catch (e: any) {
      this.logger.warn(`Wallets F-Pay du chauffeur illisibles : ${e?.message}`);
      return null;
    }
  }

  /** GET /rides/driver/earnings/fpay-wallets */
  async fpayWallets(user: UserEntity, lang = 'fr') {
    const acc = await this.fpayAccountOf(user.id);
    if (!acc) throw new BadRequestException(this.t('ride.cashout.fpay_not_linked', lang));
    const list = (await this.readFpayWallets(acc.fpayUserId)) ?? [];
    return {
      message: this.t('ride.cashout.wallets', lang),
      data: list.map((w) => ({ id: w.id, currency: w.currency, balance: w.balance, isActive: w.isActive })),
    };
  }

  // ============================================================
  // GAINS PAR DEVISE
  // ============================================================
  /** Décalage horaire par défaut (minutes, convention getTimezoneOffset) : Goma / Lubumbashi UTC+2 → -120 */
  private defaultTzOffset(): number {
    const v = Number(this.config.get<string>('DRIVER_EARNINGS_TZ_OFFSET') ?? -120);
    return Number.isFinite(v) ? Math.max(-840, Math.min(840, Math.round(v))) : -120;
  }

  /**
   * ✅ Gains du chauffeur séparés par devise (les montants USD, CDF… ne sont jamais additionnés).
   *  Gain d'une course = driverEarning (prix final − commission), à défaut prix final, à défaut prix.
   *  Pour chaque devise : aujourd'hui, cette semaine (lundi), ce mois, total, 7 derniers jours,
   *  + solde retirable (mêmes règles que le retrait F-Pay).
   */
  async summary(user: UserEntity, query: DriverEarningsSummaryQueryDto = {}, lang = 'fr') {
    const offsetMin = query.tzOffset ?? this.defaultTzOffset();
    const shift = -offsetMin * 60000; // heure locale du chauffeur = UTC + shift
    const now = Date.now();
    const localDay0 = (t: number) => {
      const d = new Date(t + shift);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - shift;
    };
    const today0 = localDay0(now);
    const weekDay = (new Date(now + shift).getUTCDay() + 6) % 7; // lundi = 0
    const week0 = today0 - weekDay * 86400000;
    const ln = new Date(now + shift);
    const month0 = Date.UTC(ln.getUTCFullYear(), ln.getUTCMonth(), 1) - shift;
    const days0 = today0 - 6 * 86400000;
    const since = new Date(Math.min(week0, month0, days0));

    const def = this.defaultCurrency().replace(/[^A-Z]/g, '') || 'USD';
    const curExpr = `UPPER(COALESCE(r.currency, '${def}'))`;
    const earnExpr = 'COALESCE(r.driverEarning, r.finalPrice, r.price, 0)';
    const grossExpr = 'COALESCE(r.finalPrice, r.price, 0)';
    const base = () => {
      const qb = this.rideRepo
        .createQueryBuilder('r')
        .where('r.driverId = :driverId', { driverId: user.id })
        .andWhere('r.status = :done', { done: RideStatus.COMPLETED });
      if (query.currency) qb.andWhere(`${curExpr} = :cur`, { cur: query.currency });
      return qb;
    };

    // Total depuis le début, par devise (calculé en base : pas de limite de nombre de courses)
    const totals: any[] = await base()
      .select(curExpr, 'currency')
      .addSelect(`COALESCE(SUM(${earnExpr}), 0)`, 'amount')
      .addSelect(`COALESCE(SUM(${grossExpr}), 0)`, 'gross')
      .addSelect('COALESCE(SUM(r.commissionAmount), 0)', 'commission')
      .addSelect('COUNT(*)', 'rides')
      .groupBy(curExpr)
      .getRawMany();

    // Courses récentes (mois / semaine / 7 jours) : réparties en JS selon l'heure locale du chauffeur
    const recent: any[] = await base()
      .select(curExpr, 'currency')
      .addSelect(earnExpr, 'earn')
      .addSelect(grossExpr, 'gross')
      .addSelect('r.commissionAmount', 'commission')
      .addSelect('COALESCE(r.completedAt, r.updatedAt, r.createdAt)', 'at')
      .addSelect('r.startedAt', 'startedAt')
      .andWhere('COALESCE(r.completedAt, r.updatedAt, r.createdAt) >= :since', { since })
      .getRawMany();

    // Note du chauffeur (toutes devises)
    const rating: any = await this.rideRepo
      .createQueryBuilder('r')
      .select('AVG(r.driverRating)', 'avg')
      .addSelect('COUNT(r.driverRating)', 'count')
      .where('r.driverId = :driverId', { driverId: user.id })
      .andWhere('r.status = :done', { done: RideStatus.COMPLETED })
      .andWhere('r.driverRating IS NOT NULL AND r.driverRating > 0')
      .getRawOne();

    const balances = await this.syncWallets(user.id);
    const period = () => ({ amount: 0, gross: 0, commission: 0, rides: 0 });
    type Bucket = {
      currency: string;
      today: ReturnType<typeof period>;
      week: ReturnType<typeof period>;
      month: ReturnType<typeof period>;
      total: ReturnType<typeof period>;
      last7: { date: string; amount: number; rides: number }[];
      onlineMinutesWeek: number;
    };
    const dayKey = (t: number) => new Date(t + shift).toISOString().slice(0, 10);
    const buckets = new Map<string, Bucket>();
    const bucket = (currency: string): Bucket => {
      let b = buckets.get(currency);
      if (!b) {
        b = {
          currency,
          today: period(),
          week: period(),
          month: period(),
          total: period(),
          last7: Array.from({ length: 7 }, (_, i) => ({ date: dayKey(days0 + i * 86400000), amount: 0, rides: 0 })),
          onlineMinutesWeek: 0,
        };
        buckets.set(currency, b);
      }
      return b;
    };
    const add = (p: ReturnType<typeof period>, earn: number, gross: number, commission: number) => {
      p.amount += earn;
      p.gross += gross;
      p.commission += commission;
      p.rides += 1;
    };

    totals.forEach((t) => {
      const b = bucket(String(t.currency));
      b.total = { amount: Number(t.amount) || 0, gross: Number(t.gross) || 0, commission: Number(t.commission) || 0, rides: Number(t.rides) || 0 };
    });
    recent.forEach((r) => {
      const b = bucket(String(r.currency));
      const earn = Number(r.earn) || 0;
      const gross = Number(r.gross) || 0;
      const commission = r.commission != null ? Number(r.commission) || 0 : Math.max(0, gross - earn);
      const at = new Date(r.at).getTime();
      if (!Number.isFinite(at)) return;
      if (at >= today0) add(b.today, earn, gross, commission);
      if (at >= week0) {
        add(b.week, earn, gross, commission);
        const started = r.startedAt ? new Date(r.startedAt).getTime() : NaN;
        if (Number.isFinite(started) && at > started) b.onlineMinutesWeek += (at - started) / 60000;
      }
      if (at >= month0) add(b.month, earn, gross, commission);
      const day = b.last7.find((d) => d.date === dayKey(at));
      if (day) {
        day.amount += earn;
        day.rides += 1;
      }
    });
    balances.forEach((bal) => {
      if (!query.currency || bal.currency === query.currency) bucket(bal.currency);
    });

    const r2 = (p: ReturnType<typeof period>) => ({
      amount: this.round2(p.amount),
      gross: this.round2(p.gross),
      commission: this.round2(p.commission),
      rides: p.rides,
    });
    const currencies = [...buckets.values()]
      .map((b) => {
        const bal = balances.find((x) => x.currency === b.currency);
        return {
          currency: b.currency,
          today: r2(b.today),
          week: r2(b.week),
          month: r2(b.month),
          total: r2(b.total),
          last7: b.last7.map((d) => ({ ...d, amount: this.round2(d.amount) })),
          onlineMinutesWeek: Math.round(b.onlineMinutesWeek),
          /** Solde retirable via F-Pay (courses payées dans l'application) */
          available: bal?.available ?? 0,
          withdrawn: bal?.withdrawn ?? 0,
          processing: bal?.processing ?? 0,
          underVerification: bal?.underVerification ?? 0,
          minAmount: bal?.minAmount ?? this.minAmount(b.currency),
          cashoutEnabled: bal?.cashoutEnabled ?? this.walletConfigured(b.currency),
        };
      })
      // Devise la plus utilisée en premier (nombre de courses), puis ordre alphabétique
      .sort((a, b) => b.total.rides - a.total.rides || a.currency.localeCompare(b.currency));

    const count = Number(rating?.count || 0);
    return {
      message: this.t('ride.cashout.summary', lang),
      data: {
        currencies,
        /** Devise principale (la plus utilisée) */
        mainCurrency: currencies[0]?.currency ?? null,
        rating: count ? Math.round(Number(rating.avg) * 10) / 10 : null,
        ratingCount: count,
        tzOffset: offsetMin,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ============================================================
  // DESTINATION : COMPTE F-PAY DU CHAUFFEUR UNIQUEMENT
  // ============================================================
  /**
   * ✅ Compte F-Pay du chauffeur (users.userIdFpay) : F-Pay retrouve SON wallet grâce à cet id + la devise du retrait.
   */
  private async destination(user: UserEntity, lang: string) {
    const acc = await this.fpayAccountOf(user.id);
    if (!acc) throw new BadRequestException(this.t('ride.cashout.fpay_not_linked', lang));
    return {
      destination: DriverCashoutDestination.FPAY,
      paymentMethodId: null as string | null,
      provider: 'FPAY',
      phone: acc.phone || '-',
      fpayAccountId: acc.fpayUserId,
      walletId: null as string | null,
    };
  }

  // ============================================================
  // RETRAIT
  // ============================================================
  async cashout(user: UserEntity, dto: DriverCashoutDto, lang = 'fr', idempotencyKey?: string) {
    if (Date.now() < this.pinRejectedUntil) throw new ServiceUnavailableException(this.t('ride.cashout.temporarily_unavailable', lang));

    const driver = await this.userRepo.findOne({ where: { id: user.id } });
    if (!driver) throw new NotFoundException(this.t('ride.driver_not_found', lang));
    if ((driver as any).status === false || (driver as any).isBlocked === true) throw new ForbiddenException(this.t('ride.forbidden', lang));

    const currency = String(dto.currency).toUpperCase();
    const amount = this.round2(dto.amount);
    const requestId = String(idempotencyKey || dto.requestId || '').trim().slice(0, 80) || null;
    // ✅ Le retrait se fait dans la devise des gains : wallet F-Pay TAXI de CETTE devise (sinon refus)
    this.assertCurrency(currency, lang);
    // ✅ Wallet F-Pay du chauffeur dans la devise du retrait (seul identifiant envoyé à F-Pay, avec montant et PIN)
    const dest = await this.destination(driver, lang);
    const walletId = dest.walletId;

    // ---------- 1. Vérifications + montant retiré du portefeuille de la devise, sous verrou du chauffeur ----------
    let cashout: DriverCashout;
    let replay: DriverCashout | null = null;
    try {
      const result = await this.dataSource.transaction(async (m) => {
        const usersTable = this.dataSource.getMetadata(UserEntity).tableName;
        await m.query(`SELECT id FROM \`${usersTable}\` WHERE id = ? FOR UPDATE`, [driver.id]);

        // Même clé d'idempotence → même retrait, jamais un second
        if (requestId) {
          const same = await m.findOne(DriverCashout, { where: { driverId: driver.id, requestId } });
          if (same) return { replay: same };
        }
        // Un retrait déjà en cours d'envoi
        const inFlight = await m.findOne(DriverCashout, { where: { driverId: driver.id, status: DriverCashoutStatus.PROCESSING } });
        if (inFlight) throw new ConflictException(this.t('ride.cashout.in_progress', lang, { reference: inFlight.reference }));
        // Répétition de la même demande (double clic, réseau) sans clé d'idempotence
        if (!requestId) {
          const recent = await m.findOne(DriverCashout, {
            where: {
              driverId: driver.id,
              currency,
              phone: dest.phone,
              createdAt: MoreThan(new Date(Date.now() - DUPLICATE_WINDOW_SECONDS * 1000)),
            },
            order: { createdAt: 'DESC' },
          });
          if (recent && Number(recent.amount) === amount && recent.status !== DriverCashoutStatus.FAILED) return { replay: recent };
        }

        // ✅ Portefeuille Favor Help de cette devise (créé par les courses) : doit exister et être actif
        await ensureDriverWallet(m, driver.id, currency);
        const wallet = await m.findOne(DriverWallet, { where: { driverId: driver.id, currency } });
        if (wallet && String(wallet.status).toUpperCase() === 'BLOCKED') {
          throw new ForbiddenException(this.t('ride.cashout.wallet_blocked', lang, { currency }));
        }

        // Solde suffisant ?
        const balances = await this.computeBalances(m, driver.id);
        const bal = balances.find((b) => b.currency === currency);
        const available = bal?.available ?? 0;
        const min = this.minAmount(currency);
        if (min > 0 && amount < min) throw new BadRequestException(this.t('ride.cashout.min_amount', lang, { min, currency }));
        if (amount > available) {
          throw new HttpException(
            {
              statusCode: HttpStatus.BAD_REQUEST,
              code: 'INSUFFICIENT_BALANCE',
              message: this.t('ride.cashout.insufficient_balance', lang, { available, amount, currency }),
              available,
              currency,
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        const created = await m.save(
          DriverCashout,
          m.create(DriverCashout, {
            reference: this.reference(),
            driverId: driver.id,
            requestId,
            amount: amount as any,
            currency,
            balanceBefore: available as any,
            destination: dest.destination,
            paymentMethodId: dest.paymentMethodId,
            provider: dest.provider,
            phone: dest.phone,
            fpayAccountId: dest.fpayAccountId,
            driverWalletId: wallet?.id ?? null,
            walletId,
            status: DriverCashoutStatus.PROCESSING,
          }),
        );

        // ✅ ÉTAPE 1 : le montant demandé est retiré du portefeuille de gains de la devise choisie,
        //    AVANT l'opération F-Pay (même transaction, chauffeur verrouillé : jamais deux retraits sur le même solde).
        //    Refus de F-Pay → le montant est rendu au portefeuille (applyErrorResponse).
        await m.update(
          DriverWallet,
          { driverId: driver.id, currency },
          { available: this.round2(available - amount) as any, lastSyncedAt: new Date() },
        );
        return { created };
      });
      if (result.replay) replay = result.replay;
      cashout = result.created!;
    } catch (e: any) {
      // Deux requêtes avec la même clé au même instant : la base refuse la 2e (index unique) → on renvoie la 1re
      if (requestId && (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062)) {
        replay = await this.cashoutRepo.findOne({ where: { driverId: driver.id, requestId } });
        if (!replay) throw e;
      } else {
        throw e;
      }
    }

    if (replay) {
      return {
        message: this.t('ride.cashout.already_requested', lang, { reference: replay.reference }),
        data: this.view(replay, { replayed: true }),
      };
    }

    // ---------- 2. ÉTAPE 2 : opération de retrait F-Pay (taxi/driver/cashout) ----------
    let fresh: DriverCashout;
    try {
      // ✅ F-Pay reçoit { amount, description, currency, countryCode, paymentMethod, userId, toApiKey } :
      //    userId = compte F-Pay du chauffeur (destinataire), toApiKey = clé du wallet TAXI débité (même devise)
      const res = await this.fpay.taxiDriverCashout({
        amount,
        currency,
        toUserId: cashout!.fpayAccountId!,
        description: `Gains Favor Taxi ${amount} ${currency} — ${driver.fullName || driver.phone || driver.id} (${cashout!.reference})`,
        countryCode: (driver as any).countryCode || 'CD',
        lang,
      });
      fresh = await this.applySuccessResponse(cashout!, res);
    } catch (e: any) {
      fresh = await this.applyErrorResponse(cashout!, e, lang);
    }

    // ---------- 3. Réponse au chauffeur ----------
    const balances = await this.syncWallets(driver.id);
    const after = balances.find((b) => b.currency === currency)?.available ?? 0;
    const data = this.view(fresh, { availableAfter: after });

    if (fresh.status === DriverCashoutStatus.SUCCESS) {
      void this.notifyDriver(fresh, 'cashout_success', lang);
      const okKey = 'ride.cashout.success_fpay';
      return { message: this.t(okKey, lang, { amount, currency, reference: fresh.fpayReference || fresh.reference }), data };
    }
    if (fresh.status === DriverCashoutStatus.FAILED) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'CASHOUT_FAILED',
          message: this.t('ride.cashout.failed', lang, { reason: fresh.failureReason || '' }),
          data,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    // UNKNOWN : montant réservé, vérification
    return { message: this.t('ride.cashout.under_verification', lang, { amount, currency, reference: fresh.reference }), data };
  }

  /** Réponse 2xx de F-Pay */
  private async applySuccessResponse(c: DriverCashout, res: any): Promise<DriverCashout> {
    const tx = res?.data?.transaction ?? null;
    const fpayStatus = String(tx?.status || '').toUpperCase() || null;
    const common = {
      fpayTransactionId: tx?.id ?? null,
      fpayReference: tx?.reference ?? null,
      fpayExternalReference: tx?.external_reference ?? tx?.externalReference ?? null,
      fpayStatus,
      fpayCurrency: tx?.currency ?? res?.data?.wallet?.currency ?? null,
      fpayMessage: res?.message ? String(res.message).slice(0, 500) : null,
      fpayResponse: this.safeResponse(res),
    };
    const wrongCurrency = !!common.fpayCurrency && String(common.fpayCurrency).toUpperCase() !== c.currency;
    if (fpayStatus === 'SUCCESS' && wrongCurrency) {
      // ✅ L'argent est parti, mais dans une autre devise que les gains retirés : montant gardé réservé,
      //    un administrateur vérifie dans F-Pay (jamais compté comme un retrait réussi dans la mauvaise devise).
      await this.cashoutRepo.update(
        { id: c.id, status: DriverCashoutStatus.PROCESSING },
        {
          ...common,
          status: DriverCashoutStatus.UNKNOWN,
          failureReason: `Devise F-Pay ${common.fpayCurrency} différente de ${c.currency} : vérifier FAVOR_API_TAXI_WALLETS`,
        },
      );
      this.logger.error(`⚠️ Retrait ${c.reference} : F-Pay a débité en ${common.fpayCurrency} au lieu de ${c.currency} → à vérifier`);
    } else if (fpayStatus === 'SUCCESS') {
      await this.cashoutRepo.update(
        { id: c.id, status: DriverCashoutStatus.PROCESSING },
        { ...common, status: DriverCashoutStatus.SUCCESS, completedAt: new Date(), failureReason: null },
      );
      this.logger.log(`✅ Retrait chauffeur ${c.reference} : ${c.amount} ${c.currency} → ${c.provider} (F-Pay ${common.fpayReference})`);
    } else {
      // Réponse sans transaction réussie : on ne peut pas conclure → vérification
      await this.cashoutRepo.update(
        { id: c.id, status: DriverCashoutStatus.PROCESSING },
        { ...common, status: DriverCashoutStatus.UNKNOWN, failureReason: `Réponse F-Pay sans confirmation (${fpayStatus || 'aucun statut'})` },
      );
      this.logger.warn(`⏳ Retrait chauffeur ${c.reference} : réponse F-Pay sans confirmation → à vérifier`);
    }
    return (await this.cashoutRepo.findOne({ where: { id: c.id } }))!;
  }

  /** Erreur F-Pay : refus certain (FAILED) ou issue inconnue (UNKNOWN) */
  private async applyErrorResponse(c: DriverCashout, e: any, lang: string): Promise<DriverCashout> {
    const body: any = typeof e?.getResponse === 'function' ? e.getResponse() : null;
    const outcome = body?.fpayOutcome === 'FAILED' ? 'FAILED' : 'UNKNOWN';
    const message = String(body?.message || e?.message || this.t('ride.cashout.fpay_error', lang)).slice(0, 500);
    const httpStatus = body?.fpayHttpStatus ?? null;

    // PIN du compte TAXI refusé : on suspend les retraits 30 min (F-Pay bloque le compte après plusieurs essais).
    // F-Pay renvoie ce refus en 400 avec « PIN incorrect » : on se base aussi sur le message.
    if (httpStatus === 401 || (outcome === 'FAILED' && /\bPIN\b/i.test(message))) {
      this.pinRejectedUntil = Date.now() + 30 * 60000;
      this.logger.error('🚫 F-Pay a refusé le PIN du compte TAXI (FAVOR_API_TAXI_PIN) : retraits suspendus 30 min');
    }

    await this.cashoutRepo.update(
      { id: c.id, status: DriverCashoutStatus.PROCESSING },
      {
        status: outcome === 'FAILED' ? DriverCashoutStatus.FAILED : DriverCashoutStatus.UNKNOWN,
        fpayMessage: message,
        fpayResponse: this.safeResponse(body),
        failureReason: message,
        completedAt: outcome === 'FAILED' ? new Date() : null,
      },
    );
    if (outcome === 'FAILED') {
      // ✅ Refus certain de F-Pay : le montant retiré à l'étape 1 est rendu au portefeuille de la devise
      await this.walletRepo
        .increment({ driverId: c.driverId, currency: c.currency }, 'available', Number(c.amount))
        .catch(() => undefined);
      this.logger.warn(`❌ Retrait chauffeur ${c.reference} refusé par F-Pay : ${message} — ${c.amount} ${c.currency} rendus au portefeuille`);
      if (/solde insuffisant|insufficient/i.test(message)) {
        this.logger.error('💰 Le wallet F-Pay TAXI n\'a pas assez de fonds pour payer les chauffeurs : à approvisionner');
      }
      void this.notifyDriver({ ...c, failureReason: message } as DriverCashout, 'cashout_failed', lang);
    } else {
      this.logger.error(`⏳ Retrait chauffeur ${c.reference} sans réponse fiable de F-Pay (${message}) → à vérifier par un administrateur`);
    }
    return (await this.cashoutRepo.findOne({ where: { id: c.id } }))!;
  }

  /** Réponse F-Pay enregistrée sans données sensibles */
  private safeResponse(res: any) {
    try {
      const json = JSON.parse(JSON.stringify(res ?? null));
      const strip = (o: any) => {
        if (!o || typeof o !== 'object') return;
        for (const k of Object.keys(o)) {
          if (/pin|token|password|secret|authorization/i.test(k)) delete o[k];
          else strip(o[k]);
        }
      };
      strip(json);
      return json;
    } catch {
      return null;
    }
  }

  private async notifyDriver(c: DriverCashout, key: 'cashout_success' | 'cashout_failed', lang: string) {
    try {
      // ✅ Recharge du compte F-Pay : texte dédié (« ajoutés à votre compte F-Pay » au lieu de « Mobile Money »)
      const notifKey = key === 'cashout_success' ? 'cashout_success_fpay' : key;
      await this.realtime.notify({
        userIds: [c.driverId],
        audience: 'driver',
        key: notifKey,
        params: { amount: Number(c.amount), currency: c.currency, reference: c.fpayReference || c.reference, reason: c.failureReason || '' },
        type: key === 'cashout_success' ? NotificationType.PAYMENT_SUCCESS : NotificationType.PAYMENT_FAILED,
        rideId: '',
        event: 'driver:cashout',
        payload: { cashoutId: c.id, reference: c.reference, status: key === 'cashout_success' ? 'SUCCESS' : 'FAILED' },
        push: 'always',
        save: true,
        lang,
      });
    } catch (e: any) {
      this.logger.warn(`Notification retrait ${c.reference} : ${e?.message}`);
    }
  }

  // ============================================================
  // HISTORIQUE
  // ============================================================
  async list(user: UserEntity, query: DriverCashoutQueryDto, lang = 'fr', admin = false) {
    if (admin && !this.isAdmin(user)) throw new ForbiddenException(this.t('ride.forbidden', lang));
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.cashoutRepo.createQueryBuilder('c').leftJoin('c.driver', 'driver').addSelect(['driver.id', 'driver.fullName', 'driver.phone']);
    if (!admin) qb.where('c.driverId = :d', { d: user.id });
    else if (query.driverId) qb.where('c.driverId = :d', { d: query.driverId });
    if (query.status) qb.andWhere('c.status = :s', { s: query.status });
    if (query.currency) qb.andWhere('c.currency = :cur', { cur: query.currency });
    const [items, total] = await qb.orderBy('c.createdAt', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return {
      message: this.t('ride.cashout.list', lang),
      data: {
        items: items.map((c) =>
          admin
            ? { ...this.view(c), phone: c.phone, walletId: c.walletId, driver: c.driver ?? null, resolutionNote: c.resolutionNote ?? null, resolvedById: c.resolvedById ?? null }
            : this.view(c),
        ),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, user: UserEntity, lang = 'fr') {
    const c = await this.cashoutRepo.findOne({ where: { id } });
    if (!c || (c.driverId !== user.id && !this.isAdmin(user))) throw new NotFoundException(this.t('ride.cashout.not_found', lang));
    return { message: this.t('ride.cashout.detail', lang), data: this.view(c) };
  }

  // ============================================================
  // ADMIN : retraits sans réponse (UNKNOWN), vérifiés dans F-Pay
  // ============================================================
  async resolve(id: string, dto: ResolveDriverCashoutDto, admin: UserEntity, lang = 'fr') {
    if (!this.isAdmin(admin)) throw new ForbiddenException(this.t('ride.forbidden', lang));
    const c = await this.cashoutRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(this.t('ride.cashout.not_found', lang));
    if (![DriverCashoutStatus.UNKNOWN, DriverCashoutStatus.PROCESSING].includes(c.status as DriverCashoutStatus)) {
      throw new BadRequestException(this.t('ride.cashout.not_resolvable', lang, { status: c.status }));
    }
    const res = await this.cashoutRepo.update(
      { id: c.id, status: c.status },
      {
        status: dto.status,
        fpayReference: dto.fpayReference ?? c.fpayReference ?? null,
        resolvedById: admin.id,
        resolutionNote: dto.note ?? null,
        completedAt: new Date(),
        failureReason: dto.status === 'FAILED' ? dto.note || c.failureReason || null : null,
      },
    );
    if (!res.affected) throw new ConflictException(this.t('ride.cashout.not_resolvable', lang, { status: c.status }));
    const fresh = (await this.cashoutRepo.findOne({ where: { id } }))!;
    // ✅ Portefeuille recalculé : FAILED → montant rendu ; SUCCESS → compté comme retiré
    await this.syncWallets(fresh.driverId).catch(() => undefined);
    void this.notifyDriver(fresh, dto.status === 'SUCCESS' ? 'cashout_success' : 'cashout_failed', lang);
    return { message: this.t('ride.cashout.resolved', lang), data: this.view(fresh) };
  }

  /** Retraits restés PROCESSING (serveur redémarré pendant l'appel F-Pay) → UNKNOWN, à vérifier */
  @Cron('0 */5 * * * *')
  async markStale() {
    try {
      const res = await this.cashoutRepo.update(
        { status: DriverCashoutStatus.PROCESSING, updatedAt: LessThan(new Date(Date.now() - STALE_PROCESSING_MINUTES * 60000)) },
        { status: DriverCashoutStatus.UNKNOWN, failureReason: 'Aucune réponse de F-Pay enregistrée — à vérifier' },
      );
      if (res.affected) this.logger.warn(`⏳ ${res.affected} retrait(s) chauffeur sans réponse → à vérifier (UNKNOWN)`);
    } catch (e: any) {
      this.logger.warn(`Retraits chauffeurs bloqués : ${e?.message}`);
    }
  }
}
