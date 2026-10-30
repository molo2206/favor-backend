import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Like, MoreThan, Repository } from 'typeorm';
import { Ride } from './entity/Ride.entity';
import { RideStatus } from './enum/RideStatus.enum';
import {
  RIDE_ADMIN_CONFIRMED_METHODS,
  RIDE_DRIVER_COLLECTED_METHODS,
  RIDE_ONLINE_PAYMENT_METHODS,
  RideEventType,
  RidePaymentMethod,
  RidePaymentStatus,
  RideSocketEvents,
} from './enum/ride-event.enum';
import { ChangeRidePaymentMethodDto, ConfirmRidePaymentDto, PayRideDto } from './dto/ride-actions.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { FpayService } from 'src/fpay/fpay.service';
import { PawapayService } from 'src/pawapay/pawapay.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { I18nService } from 'src/libs/common/src';
import { RideRealtimeService } from './ride-realtime.service';
import { RideHistoryService } from './ride-history.service';
import { UserPaymentMethodsService } from 'src/users/payment-methods/user-payment-methods.service';
import { RideCurrencyService } from './ride-currency.service';
import { ensureDriverWalletSafe } from '../DriverCashout/driver-wallet.util';

const ADMIN_ROLES: string[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
const PAWAPAY_SUCCESS = ['COMPLETED'];
const PAWAPAY_FAILED = ['REJECTED', 'FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED'];
/** ✅ Dépôt non confirmé à temps : vérifié en arrière-plan pendant ce délai (rattrapage si le client valide tard) */
const LATE_CHECK_HOURS = 24;
/** Préfixe du motif d'échec « non confirmé à temps » (dépôt encore suivi en arrière-plan) */
const TIMEOUT_MARK = '[TIMEOUT]';

/**
 * ✅ Paiement des courses taxi — tous les modes de paiement :
 *  - MOBILE_MONEY : Pawapay (prix + frais de transaction envoyé par le front) puis trace FPay, comme les commandes ;
 *  - FPAY         : portefeuille Favor Pay du passager (access_token) ;
 *  - CASH / CARD  : remis au chauffeur, qui confirme la réception ;
 *  - BANK / MANUAL: confirmés par l'administrateur.
 * Le paiement se fait à la fin de la course (prix final connu), comme Bolt.
 */
@Injectable()
export class RidePaymentService {
  private readonly logger = new Logger(RidePaymentService.name);

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    private readonly fpay: FpayService,
    private readonly pawapay: PawapayService,
    private readonly realtime: RideRealtimeService,
    private readonly history: RideHistoryService,
    private readonly i18n: I18nService,
    // ✅ Moyens de paiement enregistrés (paymentMethodId)
    private readonly userPaymentMethods: UserPaymentMethodsService,
    // ✅ Changement de devise : les montants de la course sont convertis (taux exchange_rates)
    private readonly currency: RideCurrencyService,
  ) { }

  // ============================================================
  // OUTILS
  // ============================================================
  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.i18n.translate(key, lang, params);
  }

  private round2(n: number) {
    return Math.round(Number(n) * 100) / 100;
  }

  private isAdmin(user?: UserEntity | null) {
    if (!user) return false;
    const roles: string[] = [(user as any).role, ...(((user as any).roles as string[]) || [])].filter(Boolean);
    return roles.some((r) => ADMIN_ROLES.includes(r));
  }

  private async getRide(id: string, lang: string): Promise<Ride> {
    const ride = await this.rideRepo.findOne({ where: { id } });
    if (!ride) throw new NotFoundException(this.t('ride.ride_not_found', lang));
    return ride;
  }

  /** Prix de la course (final si terminée, sinon annoncé) */
  private basePrice(ride: Ride): number {
    if (ride.finalPrice != null) return Number(ride.finalPrice);
    return ride.price != null ? Number(ride.price) : 0;
  }

  /**
   * Total à payer = prix + frais de transaction.
   * ✅ Frais, taux et devise viennent du front (comme les commandes) ; sans valeur envoyée,
   * on garde ceux déjà enregistrés sur la course.
   */
  /**
   * ✅ Montant, frais et devise envoyés par le front (comme les commandes) : enregistrés TELS QUELS.
   *    totalToPay = price (du front) + transactionFee (du front), dans `currency` (du front).
   *    Sans montant envoyé, on garde le prix déjà enregistré sur la course.
   */
  private async applyAmounts(
    ride: Ride,
    front: { price?: number | null; transactionFee?: number | null; appliedFeeRate?: number | null; currency?: string | null } = {},
    lang = 'fr',
  ) {
    const currency = this.currency.norm(front.currency);
    const previous = this.currency.norm(ride.currency);
    const hasPrice = front.price !== undefined && front.price !== null;
    // Sécurité : devise changée SANS nouveau montant → l'ancien montant est converti (jamais d'étiquette seule)
    if (currency && previous && currency !== previous && !hasPrice) {
      const conv = (v: any) => (v === null || v === undefined ? Promise.resolve(v) : this.currency.convertOrFail(Number(v), previous, currency, lang));
      const [price, finalPrice, commission, earning, assoc] = await Promise.all([
        conv(ride.price),
        conv(ride.finalPrice),
        conv(ride.commissionAmount),
        conv(ride.driverEarning),
        conv(ride.associationCommissionAmount),
      ]);
      ride.price = price as any;
      ride.finalPrice = finalPrice as any;
      ride.commissionAmount = commission as any;
      ride.driverEarning = earning as any;
      ride.associationCommissionAmount = assoc as any;
      if ((front.transactionFee === undefined || front.transactionFee === null) && ride.transactionFee != null) {
        ride.transactionFee = (await this.currency.convertOrFail(Number(ride.transactionFee), previous, currency, lang)) as any;
      }
    }
    if (currency) {
      ride.currency = currency;
      // ✅ Nouvelle devise de paiement : portefeuille du chauffeur dans cette devise
      if (ride.driverId) ensureDriverWalletSafe(this.rideRepo.manager, ride.driverId, currency, ride.id);
    }

    if (hasPrice) {
      const price = this.round2(Number(front.price));
      // Course terminée : c'est le prix final qui est payé ; sinon le prix annoncé
      if (ride.finalPrice != null || ride.status === RideStatus.COMPLETED) ride.finalPrice = price as any;
      else ride.price = price as any;
      // Commission / gain du chauffeur / part de l'association recalculés sur ce montant (même devise)
      if (ride.commissionRate != null) {
        const r = Number(ride.commissionRate);
        const commission = this.round2(price * (r > 1 ? r / 100 : r));
        ride.commissionAmount = commission as any;
        ride.driverEarning = this.round2(price - commission) as any;
      }
      if (ride.associationId && ride.associationCommissionRate != null) {
        const a = Number(ride.associationCommissionRate);
        ride.associationCommissionAmount = this.round2(price * (a > 1 ? a / 100 : a)) as any;
      }
    }
    if (front.transactionFee !== undefined && front.transactionFee !== null) ride.transactionFee = Number(front.transactionFee) as any;
    if (front.appliedFeeRate !== undefined && front.appliedFeeRate !== null) ride.transactionFeeRate = Number(front.appliedFeeRate) as any;
    ride.totalToPay = this.round2(this.basePrice(ride) + Number(ride.transactionFee || 0)) as any;
  }

  private summary(ride: Ride) {
    return {
      rideId: ride.id,
      status: ride.status,
      paymentMethod: ride.paymentMethod ?? RidePaymentMethod.CASH,
      paymentStatus: ride.paymentStatus ?? RidePaymentStatus.PENDING,
      price: this.basePrice(ride),
      transactionFee: ride.transactionFee != null ? Number(ride.transactionFee) : 0,
      transactionFeeRate: ride.transactionFeeRate != null ? Number(ride.transactionFeeRate) : 0,
      totalToPay: ride.totalToPay != null ? Number(ride.totalToPay) : this.basePrice(ride),
      currency: ride.currency ?? null,
      paidAt: ride.paidAt ?? null,
      paymentReference: ride.paymentReference ?? null,
      paymentFailureReason: ride.paymentFailureReason ? ride.paymentFailureReason.replace(TIMEOUT_MARK, '').trim() : null,
      commissionRate: ride.commissionRate != null ? Number(ride.commissionRate) : null,
      commissionAmount: ride.commissionAmount != null ? Number(ride.commissionAmount) : null,
      // ✅ Chauffeur membre d'une association : part de l'association
      associationId: ride.associationId ?? null,
      associationCommissionRate: ride.associationCommissionRate != null ? Number(ride.associationCommissionRate) : null,
      associationCommissionAmount: ride.associationCommissionAmount != null ? Number(ride.associationCommissionAmount) : null,
      driverEarning: ride.driverEarning != null ? Number(ride.driverEarning) : null,
    };
  }

  private emit(ride: Ride) {
    const payload = { ...this.summary(ride), timestamp: new Date().toISOString() };
    // ✅ Un seul envoi (room de la course + passager + chauffeur, sans doublon)
    this.realtime.emitToRideAndUsers(ride.id, [ride.riderId, ride.driverId].filter(Boolean) as string[], RideSocketEvents.PAYMENT_UPDATED, payload);
  }

  // ============================================================
  // CONSULTER / CHANGER LE MODE
  // ============================================================
  async getPayment(rideId: string, user: UserEntity, lang = 'fr') {
    let ride = await this.getRide(rideId, lang);
    if (ride.riderId !== user.id && ride.driverId !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException(this.t('ride.forbidden', lang));
    }
    if (this.hasLateDeposit(ride)) {
      await this.refreshProcessing(ride, lang);
      ride = await this.getRide(rideId, lang);
    }
    return { message: this.t('ride.payment.status', lang), data: this.summary(ride) };
  }

  /** Passager : choisir un autre mode avant de payer (le frais de transaction est recalculé) */
  async changeMethod(rideId: string, dto: ChangeRidePaymentMethodDto, user: UserEntity, lang = 'fr') {
    const ride = await this.getRide(rideId, lang);
    if (ride.riderId !== user.id && !this.isAdmin(user)) throw new ForbiddenException(this.t('ride.forbidden', lang));
    if (ride.status === RideStatus.CANCELLED) throw new BadRequestException(this.t('ride.payment.ride_cancelled', lang));
    if (ride.paymentStatus === RidePaymentStatus.PAID) throw new BadRequestException(this.t('ride.payment.already_paid', lang));
    // ✅ Plus de blocage « paiement en cours » : un dépôt non confirmé ne bloque pas le changement de mode.
    //    S'il a finalement été validé, la course est payée (pas de double débit).
    if (await this.settleLateDeposit(ride, lang)) {
      const paid = await this.getRide(rideId, lang);
      return { message: this.t('ride.payment.paid', lang), data: this.summary(paid) };
    }

    const from = ride.paymentMethod;
    ride.paymentMethod = dto.paymentMethod;
    ride.paymentStatus = RidePaymentStatus.PENDING;
    ride.paymentFailureReason = null;
    // Nouveau mode → frais du front (0 si absent)
    await this.applyAmounts(ride, { price: dto.price, transactionFee: dto.transactionFee ?? 0, appliedFeeRate: dto.appliedFeeRate ?? 0, currency: dto.currency }, lang);
    const saved = await this.rideRepo.save(ride);
    await this.history.record(ride.id, {
      type: RideEventType.PAYMENT_METHOD_CHANGED,
      actorId: user.id,
      actorRole: 'RIDER',
      payload: { from, to: dto.paymentMethod, transactionFee: saved.transactionFee, totalToPay: saved.totalToPay },
    });
    this.emit(saved);
    return { message: this.t('ride.payment.method_changed', lang), data: this.summary(saved) };
  }

  // ============================================================
  // PAYER (passager)
  // ============================================================
  async pay(rideId: string, dto: PayRideDto, user: UserEntity, lang = 'fr') {
    // ✅ Moyen de paiement enregistré : mode, opérateur, numéro
    await this.userPaymentMethods.applyTo(dto, user.id, lang, { setCurrency: true });
    const ride = await this.getRide(rideId, lang);
    if (ride.riderId !== user.id) throw new ForbiddenException(this.t('ride.forbidden', lang));
    if (ride.status !== RideStatus.COMPLETED) throw new BadRequestException(this.t('ride.payment.only_completed', lang));
    if (ride.paymentStatus === RidePaymentStatus.PAID) throw new BadRequestException(this.t('ride.payment.already_paid', lang));
    // ✅ Nouvelle tentative : si l'ancien dépôt a finalement été validé, la course est déjà payée (pas de double débit)
    if (await this.settleLateDeposit(ride, lang)) {
      const paid = await this.getRide(rideId, lang);
      return { message: this.t('ride.payment.paid', lang), data: this.summary(paid) };
    }

    if (dto.paymentMethod && dto.paymentMethod !== ride.paymentMethod) ride.paymentMethod = dto.paymentMethod;
    const method = (ride.paymentMethod || RidePaymentMethod.CASH) as RidePaymentMethod;
    await this.applyAmounts(ride, { price: dto.price, transactionFee: dto.transactionFee, appliedFeeRate: dto.appliedFeeRate, currency: dto.currency }, lang);
    ride.paymentFailureReason = null;
    const total = Number(ride.totalToPay || 0);
    if (total <= 0) throw new BadRequestException(this.t('ride.payment.no_amount', lang));

    // Payé au chauffeur / confirmé par l'admin : rien à débiter dans l'application
    if (RIDE_DRIVER_COLLECTED_METHODS.includes(method) || RIDE_ADMIN_CONFIRMED_METHODS.includes(method)) {
      ride.paymentStatus = RidePaymentStatus.PENDING;
      const saved = await this.rideRepo.save(ride);
      this.emit(saved);
      const key = RIDE_DRIVER_COLLECTED_METHODS.includes(method) ? 'ride.payment.pay_driver' : 'ride.payment.wait_admin';
      return { message: this.t(key, lang, { amount: total, currency: ride.currency ?? '' }), data: this.summary(saved) };
    }

    const description = `Course taxi #${ride.id.slice(0, 8).toUpperCase()}`;
    if (method === RidePaymentMethod.FPAY) return this.payFpay(ride, dto, user, description, lang);
    if (method === RidePaymentMethod.MOBILE_MONEY) return this.payMobileMoney(ride, dto, user, description, lang);
    throw new BadRequestException(this.t('ride.payment.invalid_method', lang));
  }

  private async payFpay(ride: Ride, dto: PayRideDto, user: UserEntity, description: string, lang: string) {
    if (!dto.access_token) throw new BadRequestException(this.t('ride.payment.fpay_token_required', lang));
    ride.paymentStartedAt = new Date();
    await this.rideRepo.save(ride);
    await this.history.record(ride.id, { type: RideEventType.PAYMENT_STARTED, actorId: user.id, actorRole: 'RIDER', payload: { method: 'FPAY', total: ride.totalToPay } });
    try {
      const res: any = await this.fpay.makePaymentTaxi(
        {
          amount: Number(ride.totalToPay),
          currency: ride.currency || 'USD',
          description,
          access_token: dto.access_token,
          userId: user.userIdFpay,             // ✅ AJOUT — identifiant FPay du payeur
        } as any,
        user,
      );
      const tx = res?.data?.transaction;
      if (tx?.status === 'SUCCESS') {
        return this.markPaid(ride, { transactionId: tx.id ?? null, reference: tx.reference ?? null, actorId: user.id, actorRole: 'RIDER' }, lang);
      }
      const msg = res?.message || this.t('ride.payment.failed', lang);
      await this.markFailed(ride, msg, user.id, lang);
      throw new BadRequestException(msg);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      const msg = e?.response?.message || e?.message || this.t('ride.payment.failed', lang);
      await this.markFailed(ride, String(msg), user.id, lang);
      throw new BadRequestException(msg);
    }
  }

  private async payMobileMoney(ride: Ride, dto: PayRideDto, user: UserEntity, description: string, lang: string) {
    const provider = dto.provider?.trim();
    const phone = dto.phone?.trim().replace(/^\+/, '');
    if (!provider || !phone) throw new BadRequestException(this.t('ride.payment.mobile_money_required', lang));

    ride.paymentProvider = provider;
    ride.paymentPhone = phone;
    ride.paymentStartedAt = new Date();
    await this.rideRepo.save(ride);
    await this.history.record(ride.id, {
      type: RideEventType.PAYMENT_STARTED,
      actorId: user.id,
      actorRole: 'RIDER',
      payload: { method: 'MOBILE_MONEY', provider, price: this.basePrice(ride), transactionFee: ride.transactionFee, total: ride.totalToPay },
    });

    let res: any;
    try {
      res = await this.pawapay.createDepositSimple({
        amount: String(ride.totalToPay),
        currency: ride.currency || 'USD',
        provider,
        phone,
      });
    } catch (e: any) {
      const msg = e?.response?.data?.failureReason?.failureMessage || e?.message || this.t('ride.payment.failed', lang);
      await this.markFailed(ride, String(msg), user.id, lang);
      throw new BadRequestException(msg);
    }

    const depositId = res?.deposit?.depositId ?? res?.depositId ?? null;
    const status = String(res?.finalStatus?.data?.status || res?.status || '').toUpperCase();
    const failure = res?.finalStatus?.data?.failureReason?.failureMessage || res?.failureReason?.failureMessage;
    ride.paymentExternalId = depositId;

    if (PAWAPAY_SUCCESS.includes(status)) {
      const trace = await this.fpayTrace(ride, description, lang);
      return this.markPaid(ride, { ...trace, actorId: user.id, actorRole: 'RIDER' }, lang);
    }
    if (PAWAPAY_FAILED.includes(status)) {
      const msg = failure || this.t('ride.payment.failed', lang);
      ride.paymentExternalId = null; // échec définitif : plus rien à suivre
      await this.markFailed(ride, msg, user.id, lang);
      throw new BadRequestException(msg);
    }
    // ✅ TIMEOUT / ACCEPTED / PENDING… : pas de statut « en attente » qui bloque.
    //    Échec immédiat (le client peut réessayer ou changer de mode) ; le dépôt reste suivi en arrière-plan
    //    pendant 24 h : si le client valide quand même, la course passe PAYÉE automatiquement.
    const msg = this.t('ride.payment.not_confirmed', lang);
    await this.markFailed(ride, `${TIMEOUT_MARK} ${msg}`, user.id, lang);
    throw new BadRequestException({ message: msg, code: 'PAYMENT_NOT_CONFIRMED', rideId: ride.id, paymentStatus: RidePaymentStatus.FAILED });
  }

  /** Courses en cours de crédit du compte TAXI (évite deux crédits si deux vérifications arrivent en même temps) */
  private readonly taxiCrediting = new Set<string>();

  /** Mode de paiement de la course → valeur acceptée par F-Pay (enum transaction_paymentMethod) */
  private fpayMethodOf(method?: string | null): string {
    switch (String(method || '').toUpperCase()) {
      case RidePaymentMethod.MOBILE_MONEY:
        return 'MOBILE_MONEY';
      case RidePaymentMethod.CARD:
        return 'CREDIT_DEBIT_CARD';
      case RidePaymentMethod.BANK:
        return 'BANK_TRANSFERT';
      case RidePaymentMethod.FPAY:
        return 'INTERNAL';
      default:
        return 'CASH'; // CASH, MANUAL
    }
  }

  /**
   * ✅ Crédite le compte F-Pay TAXI (clé FAVOR_API_TAXI) du montant de la course, dans sa devise.
   * Jamais deux fois pour la même course.
   *  - strict = false (paiement Mobile Money déjà encaissé) : n'échoue jamais, l'erreur est journalisée ;
   *  - strict = true (validation admin) : refus si F-Pay ne confirme pas → la course n'est PAS marquée payée.
   */
  private async creditTaxiAccount(
    ride: Ride,
    description: string,
    paymentMethod: string,
    lang: string,
    strict = false,
  ): Promise<{ transactionId?: string | null; reference?: string | null }> {
    if (this.taxiCrediting.has(ride.id)) {
      if (strict) throw new BadRequestException(this.t('ride.payment.fpay_credit_in_progress', lang));
      return {};
    }
    this.taxiCrediting.add(ride.id);
    try {
      // Déjà payée et créditée (autre vérification passée avant) : on ne recrédite pas
      const fresh = await this.rideRepo.findOne({ where: { id: ride.id } });
      if (fresh?.paymentTransactionId) {
        return { transactionId: fresh.paymentTransactionId, reference: fresh.paymentReference ?? null };
      }
      const r: any = await this.fpay.payWithMobileMoneyTaxi(
        Number(ride.totalToPay ?? this.basePrice(ride)),
        ride.currency || 'USD',
        `${description} — course ${ride.id}`,
        paymentMethod,
        undefined,
        lang,
      );
      const tx = r?.data?.transaction;
      if (tx?.status === 'SUCCESS') return { transactionId: tx.id ?? null, reference: tx.reference ?? null };
      this.logger.warn(`Crédit compte TAXI (course ${ride.id}) : réponse F-Pay sans succès (${tx?.status ?? 'aucun statut'})`);
      if (strict) throw new BadRequestException(this.t('ride.payment.fpay_credit_failed', lang, { reason: tx?.status ?? '' }));
    } catch (e: any) {
      if (strict) {
        if (e instanceof BadRequestException) throw e;
        const reason = String(e?.response?.message || e?.message || '');
        this.logger.error(`Validation admin course ${ride.id} : F-Pay a refusé le crédit du compte TAXI (${reason})`);
        throw new BadRequestException(this.t('ride.payment.fpay_credit_failed', lang, { reason }));
      }
      this.logger.error(`Crédit compte TAXI (course ${ride.id}) non effectué : ${e?.message} — à créditer manuellement`);
    } finally {
      this.taxiCrediting.delete(ride.id);
    }
    return {};
  }

  /**
   * ✅ Course payée par Mobile Money : le montant est crédité sur le compte F-Pay TAXI (clé FAVOR_API_TAXI),
   * comme les commandes créditent le compte HELP. Ce wallet TAXI (même devise) paie ensuite les retraits des chauffeurs.
   * Jamais deux fois pour la même course ; n'empêche jamais la course de passer PAYÉE si F-Pay ne répond pas.
   */
  private async fpayTrace(ride: Ride, description: string, lang: string): Promise<{ transactionId?: string | null; reference?: string | null }> {
    return this.creditTaxiAccount(ride, description, 'MOBILE_MONEY', lang, false);
  }

  /** Validation admin envoyée à F-Pay (RIDE_ADMIN_CONFIRM_FPAY=false pour couper) */
  private get adminConfirmFpay(): boolean {
    return String(process.env.RIDE_ADMIN_CONFIRM_FPAY ?? 'true').toLowerCase() !== 'false';
  }

  // ============================================================
  // CONFIRMATIONS HORS APPLICATION
  // ============================================================
  /** Chauffeur : espèces / carte reçues */
  async confirmByDriver(rideId: string, dto: ConfirmRidePaymentDto, user: UserEntity, lang = 'fr') {
    const ride = await this.getRide(rideId, lang);
    if (ride.driverId !== user.id) throw new ForbiddenException(this.t('ride.not_your_ride', lang));
    if (ride.status !== RideStatus.COMPLETED) throw new BadRequestException(this.t('ride.payment.only_completed', lang));
    if (ride.paymentStatus === RidePaymentStatus.PAID) return { message: this.t('ride.payment.paid', lang), data: this.summary(ride) };

    const method = (dto.paymentMethod || ride.paymentMethod || RidePaymentMethod.CASH) as string;
    if (!RIDE_DRIVER_COLLECTED_METHODS.includes(method)) {
      throw new BadRequestException(this.t('ride.payment.driver_confirm_only_cash', lang));
    }
    if (method !== ride.paymentMethod) ride.paymentMethod = method;
    await this.applyAmounts(ride, { transactionFee: dto.transactionFee }, lang);
    return this.markPaid(ride, { reference: dto.reference ?? null, actorId: user.id, actorRole: 'DRIVER', confirmedById: user.id }, lang);
  }

  /** Admin : virement, agence, ou régularisation de n'importe quel mode */
  async confirmByAdmin(rideId: string, dto: ConfirmRidePaymentDto, user: UserEntity, lang = 'fr') {
    if (!this.isAdmin(user)) throw new ForbiddenException(this.t('ride.forbidden', lang));
    const ride = await this.getRide(rideId, lang);
    if (ride.paymentStatus === RidePaymentStatus.PAID) return { message: this.t('ride.payment.paid', lang), data: this.summary(ride) };
    if (dto.paymentMethod && dto.paymentMethod !== ride.paymentMethod) ride.paymentMethod = dto.paymentMethod;
    await this.applyAmounts(ride, { transactionFee: dto.transactionFee }, lang);

    // ✅ Course payée par Mobile Money ou F-Pay : la validation passe aussi sur F-Pay (compte TAXI crédité du
    //    montant de la course, même devise), AVANT de marquer la course payée. Si F-Pay refuse, la course reste
    //    non payée (l'admin peut réessayer). Espèces, carte, virement, manuel : pas d'envoi à F-Pay.
    let fpay: { transactionId?: string | null; reference?: string | null } = {};
    if (this.adminConfirmFpay && RIDE_ONLINE_PAYMENT_METHODS.includes(String(ride.paymentMethod || '').toUpperCase())) {
      fpay = await this.creditTaxiAccount(
        ride,
        `Course taxi #${ride.id.slice(0, 8).toUpperCase()} — validée par l'administrateur`,
        this.fpayMethodOf(ride.paymentMethod),
        lang,
        true,
      );
    }
    return this.markPaid(
      ride,
      {
        transactionId: fpay.transactionId ?? null,
        // Référence saisie par l'admin (virement, reçu…) en priorité, sinon référence F-Pay
        reference: dto.reference ?? fpay.reference ?? null,
        actorId: user.id,
        actorRole: 'ADMIN',
        confirmedById: user.id,
      },
      lang,
    );
  }

  // ============================================================
  // ÉTATS
  // ============================================================
  private async markPaid(
    ride: Ride,
    info: { transactionId?: string | null; reference?: string | null; actorId?: string | null; actorRole?: string; confirmedById?: string | null },
    lang: string,
  ) {
    ride.paymentStatus = RidePaymentStatus.PAID;
    ride.paidAt = new Date();
    ride.paymentFailureReason = null;
    if (info.transactionId) ride.paymentTransactionId = info.transactionId;
    if (info.reference) ride.paymentReference = info.reference;
    if (info.confirmedById) ride.paymentConfirmedById = info.confirmedById;
    const saved = await this.rideRepo.save(ride);

    await this.history.record(ride.id, {
      type: RideEventType.PAYMENT_PAID,
      actorId: info.actorId ?? null,
      actorRole: info.actorRole ?? 'SYSTEM',
      payload: { method: saved.paymentMethod, total: saved.totalToPay, transactionFee: saved.transactionFee, reference: saved.paymentReference },
    });
    this.emit(saved);

    const params = { amount: Number(saved.totalToPay ?? this.basePrice(saved)), currency: saved.currency ?? '', method: saved.paymentMethod ?? '' };
    const data = { ...this.summary(saved) };
    await this.realtime.notify({
      userIds: [saved.riderId],
      audience: 'rider',
      key: 'payment_success',
      params,
      type: NotificationType.RIDE_PAYMENT,
      rideId: saved.id,
      payload: data,
      push: 'offline',
      lang,
    });
    if (saved.driverId) {
      await this.realtime.notify({
        userIds: [saved.driverId],
        audience: 'driver',
        key: 'payment_received',
        params: { ...params, earning: saved.driverEarning != null ? Number(saved.driverEarning) : '' },
        type: NotificationType.RIDE_PAYMENT,
        rideId: saved.id,
        payload: data,
        push: 'offline',
        lang,
      });
    }
    return { message: this.t('ride.payment.paid', lang), data: this.summary(saved) };
  }

  private async markFailed(ride: Ride, reason: string, actorId: string | null, lang: string) {
    ride.paymentStatus = RidePaymentStatus.FAILED;
    ride.paymentFailureReason = String(reason).slice(0, 500);
    const saved = await this.rideRepo.save(ride);
    await this.history.record(ride.id, { type: RideEventType.PAYMENT_FAILED, actorId, actorRole: actorId ? 'RIDER' : 'SYSTEM', payload: { reason: saved.paymentFailureReason } });
    this.emit(saved);
    await this.realtime.notify({
      userIds: [saved.riderId],
      audience: 'rider',
      key: 'payment_failed',
      params: { reason: (saved.paymentFailureReason ?? '').replace(TIMEOUT_MARK, '').trim() },
      type: NotificationType.RIDE_PAYMENT,
      rideId: saved.id,
      payload: this.summary(saved),
      push: 'offline',
      lang,
    });
  }

  // ============================================================
  // SUIVI MOBILE MONEY
  // ============================================================
  /** Dépôt Mobile Money non confirmé à temps, encore suivi (ou ancien statut PROCESSING) */
  private hasLateDeposit(ride: Ride): boolean {
    if (!ride.paymentExternalId || ride.paymentStatus === RidePaymentStatus.PAID) return false;
    if (ride.paymentStatus === RidePaymentStatus.PROCESSING) return true;
    return ride.paymentStatus === RidePaymentStatus.FAILED && String(ride.paymentFailureReason || '').startsWith(TIMEOUT_MARK);
  }

  /**
   * Avant une nouvelle tentative / un changement de mode : l'ancien dépôt a-t-il finalement été validé ?
   * Oui → course payée (renvoie true). Sinon → le dépôt n'est plus suivi (on repart proprement).
   */
  private async settleLateDeposit(ride: Ride, lang: string): Promise<boolean> {
    if (!this.hasLateDeposit(ride)) return false;
    await this.refreshProcessing(ride, lang);
    const fresh = await this.getRide(ride.id, lang);
    if (fresh.paymentStatus === RidePaymentStatus.PAID) return true;
    await this.rideRepo.update({ id: ride.id }, { paymentExternalId: null });
    ride.paymentExternalId = null;
    if (ride.paymentStatus === RidePaymentStatus.PROCESSING) ride.paymentStatus = RidePaymentStatus.FAILED;
    return false;
  }

  /** Vérifie un dépôt Pawapay suivi : payé → course PAYÉE ; refusé → plus suivi ; trop vieux → plus suivi */
  private async refreshProcessing(ride: Ride, lang = 'fr') {
    if (!ride.paymentExternalId) return;
    const tooOld = ride.paymentStartedAt && Date.now() - new Date(ride.paymentStartedAt).getTime() > LATE_CHECK_HOURS * 3600000;
    try {
      const res: any = await this.pawapay.checkDepositStatus(ride.paymentExternalId);
      const data = Array.isArray(res) ? res[0] : res?.data ?? res;
      const status = String(data?.status || '').toUpperCase();
      if (PAWAPAY_SUCCESS.includes(status)) {
        const trace = await this.fpayTrace(ride, `Course taxi #${ride.id.slice(0, 8).toUpperCase()}`, lang);
        await this.markPaid(ride, { ...trace, actorRole: 'SYSTEM' }, lang);
        return;
      }
      if (PAWAPAY_FAILED.includes(status) || tooOld) {
        const reason = PAWAPAY_FAILED.includes(status) ? data?.failureReason?.failureMessage || status : this.t('ride.payment.expired', lang);
        await this.rideRepo.update(
          { id: ride.id },
          {
            paymentExternalId: null,
            ...(ride.paymentStatus === RidePaymentStatus.PROCESSING
              ? { paymentStatus: RidePaymentStatus.FAILED, paymentFailureReason: String(reason).slice(0, 500) }
              : { paymentFailureReason: String(reason).slice(0, 500) }),
          },
        );
      }
    } catch (e: any) {
      this.logger.warn(`Vérification Pawapay (course ${ride.id}) : ${e?.message}`);
    }
  }

  /** ✅ Dépôts non confirmés à temps (et anciens PROCESSING) : rattrapage toutes les 2 minutes pendant 24 h */
  @Cron('30 */2 * * * *')
  async sweepProcessing() {
    const since = new Date(Date.now() - LATE_CHECK_HOURS * 3600000 - 3600000);
    const list = await this.rideRepo.find({
      where: [
        { paymentStatus: RidePaymentStatus.PROCESSING, paymentStartedAt: LessThan(new Date(Date.now() - 60000)) },
        {
          paymentStatus: RidePaymentStatus.FAILED,
          paymentFailureReason: Like(`${TIMEOUT_MARK}%`),
          paymentStartedAt: MoreThan(since),
        },
      ],
      take: 50,
      order: { paymentStartedAt: 'ASC' },
    });
    for (const ride of list) if (ride.paymentExternalId) await this.refreshProcessing(ride);
  }

}
