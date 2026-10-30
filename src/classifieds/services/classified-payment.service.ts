import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { In, LessThan, Like, MoreThan } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { FpayService } from 'src/fpay/fpay.service';
import { PawapayService } from 'src/pawapay/pawapay.service';
import { Product } from 'src/products/entities/product.entity';
import { ImageProductEntity } from 'src/products/entities/imageProduct.entity';
import { ListingType } from 'src/products/enum/listing-type.enum';
import { ClassifiedPaymentMethod, ClassifiedPaymentStatus, ClassifiedStatus, PAYABLE_STATUSES } from '../enums/classified.enums';
import { ClassifiedPayment } from '../entities/classified-payment.entity';
import { ClassifiedPricingPlan } from '../entities/classified-pricing-plan.entity';
import { ManualPaymentDto, PayClassifiedDto } from '../dto/classified.dto';
import {
  addDays,
  ClassifiedCommonService,
  FREE_MAX_ACTIVE,
  MODERATION_ENABLED,
  REMINDER_DAYS,
  REQUIRE_IMAGE,
  reference,
} from './classified-common.service';
import { ClassifiedPricingService } from './classified-pricing.service';
import { productStatusFor } from './classified.service';
import { UserPaymentMethodsService } from 'src/users/payment-methods/user-payment-methods.service';

/** Statuts Pawapay */
const PAWAPAY_SUCCESS = ['COMPLETED'];
const PAWAPAY_FAILED = ['REJECTED', 'FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED'];
/** Un paiement Mobile Money non confirmé après ce délai est abandonné */
const PENDING_MAX_HOURS = 24;
/** ✅ Motif d'un dépôt non confirmé à temps : le paiement est ÉCHOUÉ (rien ne bloque) mais encore suivi 24 h */
const TIMEOUT_MARK = '[TIMEOUT]';

/**
 * Paiement de la mise en ligne d'une annonce (ligne `products`, listingType = CLASSIFIED),
 * avec les canaux déjà en place : FPay (jeton du client) ou Mobile Money (Pawapay, puis trace FPay
 * comme pour les commandes et les colis).
 */
@Injectable()
export class ClassifiedPaymentService {
  private readonly logger = new Logger(ClassifiedPaymentService.name);

  constructor(
    private readonly common: ClassifiedCommonService,
    private readonly pricing: ClassifiedPricingService,
    private readonly fpay: FpayService,
    private readonly pawapay: PawapayService,
    // ✅ Moyens de paiement enregistrés (paymentMethodId)
    private readonly userPaymentMethods: UserPaymentMethodsService,
  ) { }

  /** Montant réellement débité (forfait + frais de transaction) */
  private payable(payment: ClassifiedPayment): number {
    return payment.totalAmount != null ? Number(payment.totalAmount) : Number(payment.amount);
  }

  private get m() {
    return this.common.m;
  }

  private findAd(id: string) {
    return this.m.findOne(Product, { where: { id, listingType: ListingType.CLASSIFIED } });
  }

  // ============================================================
  // PAYER / RENOUVELER
  // ============================================================
  async pay(productId: string, dto: PayClassifiedDto, user: UserEntity, lang: string) {
    // ✅ Moyen de paiement enregistré (une annonce se paie par Mobile Money ou FPay, pas en espèces)
    await this.userPaymentMethods.applyTo(dto as any, user.id, lang, { allowed: ['MOBILE_MONEY', 'FPAY'] });
    const ad = await this.m.findOne(Product, { where: { id: productId, listingType: ListingType.CLASSIFIED, adDeleted: false }, relations: ['category'] });
    if (!ad) throw new NotFoundException(this.common.t('classified.not_found', lang));
    if (ad.ownerId !== user.id) throw new BadRequestException(this.common.t('classified.forbidden', lang));
    if (!ad.adStatus || !PAYABLE_STATUSES.includes(ad.adStatus)) {
      throw new BadRequestException(this.common.t('classified.not_payable', lang, { status: ad.adStatus }));
    }
    if (!ad.adCityId) throw new BadRequestException(this.common.t('classified.city_not_found', lang));

    // ✅ Plus de blocage « paiement en cours » : un ancien dépôt non confirmé est vérifié une dernière fois.
    //    S'il a finalement été validé, l'annonce est publiée (pas de double paiement) ; sinon on repart proprement.
    const settled = await this.settleLateDeposits(productId, lang);
    if (settled) return settled;

    // Le forfait doit être proposé pour le TYPE DE PRODUIT, la ville et la catégorie de l'annonce
    // (empêche de payer le tarif d'un autre type de produit ou d'une autre ville)
    const plans = await this.pricing.resolvePlans(ad.adCityId, ad.category?.id, lang, ad.type);
    const plan = plans.find((p) => p.id === dto.planId);
    if (!plan) throw new BadRequestException(this.common.t('classified.plan_not_available', lang));

    const imageCount = await this.m.count(ImageProductEntity, { where: { product: { id: productId } } });
    if (REQUIRE_IMAGE && imageCount === 0) throw new BadRequestException(this.common.t('classified.image_required', lang));
    if (imageCount > plan.maxImages) throw new BadRequestException(this.common.t('classified.plan_max_images', lang, { max: plan.maxImages }));

    const amount = Number(plan.price);
    const isFree = amount <= 0;
    if (isFree) await this.checkFreeQuota(user.id, productId, lang);
    const method = isFree ? ClassifiedPaymentMethod.FREE : dto.paymentMethod;
    if (!isFree && ![ClassifiedPaymentMethod.FPAY, ClassifiedPaymentMethod.MOBILE_MONEY].includes(method)) {
      throw new BadRequestException(this.common.t('classified.invalid_payment_method', lang));
    }

    // ✅ Frais de transaction et devise : envoyés par le front (comme pour les commandes)
    const transactionFee = isFree ? 0 : Number(dto.transactionFee || 0);
    const currency = dto.currency || plan.currency;

    const payment = await this.m.save(
      ClassifiedPayment,
      this.m.create(ClassifiedPayment, {
        reference: reference('PAN'),
        productId,
        userId: user.id,
        planId: plan.id,
        planSnapshot: this.snapshot(plan),
        cityId: ad.adCityId,
        amount,
        transactionFee,
        transactionFeeRate: isFree ? 0 : Number(dto.appliedFeeRate || 0),
        totalAmount: Math.round((amount + transactionFee) * 100) / 100,
        currency,
        method,
        status: ClassifiedPaymentStatus.PENDING,
        provider: dto.provider ?? null,
        phone: dto.phone ?? null,
      }),
    );
    const description = `Annonce « ${ad.name.slice(0, 60)} » — ${plan.name}`;

    if (isFree) return this.succeed(payment, lang, {});
    if (method === ClassifiedPaymentMethod.FPAY) return this.payFpay(payment, dto, user, description, lang);
    return this.payMobileMoney(payment, ad, dto, description, lang);
  }

  private snapshot(plan: ClassifiedPricingPlan) {
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      durationDays: plan.durationDays,
      price: Number(plan.price),
      currency: plan.currency,
      isFeatured: plan.isFeatured,
      cityId: plan.cityId ?? null,
      countryId: plan.countryId ?? null,
      categoryId: plan.categoryId ?? null,
      productType: plan.productType ?? null,
    };
  }

  /** Limite d'annonces gratuites en ligne (anti-spam) */
  private async checkFreeQuota(userId: string, productId: string, lang: string) {
    if (FREE_MAX_ACTIVE <= 0) return;
    const rows = await this.common.dataSource.query(
      "SELECT COUNT(*) AS n FROM `products` a WHERE a.`listingType` = 'CLASSIFIED' AND a.`ownerId` = ? AND a.`id` <> ? AND a.`adDeleted` = 0 AND a.`adStatus` IN ('ACTIVE','PENDING_REVIEW') " +
        "AND (SELECT p.`method` FROM `classified_payments` p WHERE p.`productId` = a.`id` AND p.`status` = 'SUCCESS' ORDER BY p.`paidAt` DESC LIMIT 1) = 'FREE'",
      [userId, productId],
    );
    if (Number(rows?.[0]?.n || 0) >= FREE_MAX_ACTIVE) {
      throw new BadRequestException(this.common.t('classified.free_quota_reached', lang, { max: FREE_MAX_ACTIVE }));
    }
  }

  private async payFpay(payment: ClassifiedPayment, dto: PayClassifiedDto, user: UserEntity, description: string, lang: string) {
    if (!dto.access_token) {
      await this.fail(payment, this.common.t('classified.fpay_token_required', lang), lang, false);
      throw new BadRequestException(this.common.t('classified.fpay_token_required', lang));
    }
    try {
      const res: any = await this.fpay.makePayment(
        { amount: this.payable(payment), currency: payment.currency, description, access_token: dto.access_token } as any,
        user,
      );
      const tx = res?.data?.transaction;
      if (tx?.status === 'SUCCESS') return this.succeed(payment, lang, { transactionId: tx.id ?? null, transactionReference: tx.reference ?? null });
      await this.fail(payment, res?.message || this.common.t('classified.payment_failed', lang), lang);
      throw new BadRequestException(res?.message || this.common.t('classified.payment_failed', lang));
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      const msg = e?.response?.message || e?.message || this.common.t('classified.payment_failed', lang);
      await this.fail(payment, String(msg), lang);
      throw new BadRequestException(msg);
    }
  }

  private async payMobileMoney(payment: ClassifiedPayment, ad: Product, dto: PayClassifiedDto, description: string, lang: string) {
    if (!dto.provider || !dto.phone) {
      await this.fail(payment, this.common.t('classified.mobile_money_required', lang), lang, false);
      throw new BadRequestException(this.common.t('classified.mobile_money_required', lang));
    }
    let res: any;
    try {
      res = await this.pawapay.createDepositSimple({
        amount: String(this.payable(payment)), // ✅ forfait + frais de transaction
        currency: payment.currency,
        provider: dto.provider,
        phone: dto.phone.replace(/^\+/, ''),
      });
    } catch (e: any) {
      const msg = e?.response?.data?.failureReason?.failureMessage || e?.message || this.common.t('classified.payment_failed', lang);
      await this.fail(payment, String(msg), lang);
      throw new BadRequestException(msg);
    }
    const depositId = res?.deposit?.depositId ?? res?.depositId ?? null;
    // createDepositSimple : statut final après l'attente (finalStatus.data.status), comme les commandes
    const status = String(res?.finalStatus?.data?.status || res?.status || '').toUpperCase();
    const failureMessage = res?.finalStatus?.data?.failureReason?.failureMessage || res?.failureReason?.failureMessage;
    await this.m.update(ClassifiedPayment, { id: payment.id }, { externalId: depositId });
    payment.externalId = depositId;

    if (PAWAPAY_SUCCESS.includes(status)) {
      const trace = await this.fpayTrace(payment, description, lang);
      return this.succeed(payment, lang, trace);
    }
    if (PAWAPAY_FAILED.includes(status)) {
      const msg = failureMessage || res?.message || this.common.t('classified.payment_failed', lang);
      await this.fail(payment, msg, lang);
      throw new BadRequestException(msg);
    }
    // ✅ TIMEOUT / ACCEPTED / PENDING… : pas de statut « en attente ». Échec immédiat (l'annonce reste en brouillon,
    //    le client peut réessayer) ; le dépôt reste suivi 24 h : s'il est validé tard, l'annonce est publiée automatiquement.
    const msg = this.common.t('classified.payment_not_confirmed', lang);
    await this.fail(payment, `${TIMEOUT_MARK} ${msg}`, lang, false);
    throw new BadRequestException({ message: msg, code: 'PAYMENT_NOT_CONFIRMED', paymentId: payment.id });
  }

  /**
   * ✅ Anciens dépôts de cette annonce encore suivis (PENDING ou non confirmés à temps) :
   * validés entre-temps → annonce publiée (renvoie la réponse) ; sinon plus suivis.
   */
  private async settleLateDeposits(productId: string, lang: string) {
    const since = new Date(Date.now() - PENDING_MAX_HOURS * 3600000);
    const list = await this.m.find(ClassifiedPayment, {
      where: [
        { productId, status: ClassifiedPaymentStatus.PENDING, createdAt: MoreThan(since) },
        { productId, status: ClassifiedPaymentStatus.FAILED, failureReason: Like(`${TIMEOUT_MARK}%`), createdAt: MoreThan(since) },
      ],
      order: { createdAt: 'DESC' },
    });
    for (const p of list) {
      await this.refreshPending(p, lang);
      const fresh = await this.m.findOne(ClassifiedPayment, { where: { id: p.id } });
      if (fresh?.status === ClassifiedPaymentStatus.SUCCESS) {
        return {
          message: this.common.t('classified.published', lang),
          data: { payment: fresh, ad: await this.findAd(productId) },
        };
      }
      // Plus suivi : on retire le marqueur (le client repaie)
      await this.m.update(ClassifiedPayment, { id: p.id, status: In([ClassifiedPaymentStatus.PENDING, ClassifiedPaymentStatus.FAILED]) }, {
        status: ClassifiedPaymentStatus.FAILED,
        failureReason: String(fresh?.failureReason || this.common.t('classified.payment_not_confirmed', lang)).replace(TIMEOUT_MARK, '').trim().slice(0, 500),
      });
    }
    return null;
  }

  /** Trace du paiement Mobile Money côté FPay (comme commandes et colis) — n'échoue jamais */
  private async fpayTrace(payment: ClassifiedPayment, description: string, lang: string) {
    try {
      const r: any = await this.fpay.payWithMobileMoney(this.payable(payment), payment.currency, description, 'MOBILE_MONEY', undefined, lang);
      const tx = r?.data?.transaction;
      if (tx?.status === 'SUCCESS') return { transactionId: tx.id ?? null, transactionReference: tx.reference ?? null };
    } catch (e: any) {
      this.logger.warn(`Trace FPay Mobile Money ignorée: ${e?.message}`);
    }
    return {};
  }

  private async fail(payment: ClassifiedPayment, reason: string, lang: string, notify = true) {
    await this.m.update(ClassifiedPayment, { id: payment.id }, { status: ClassifiedPaymentStatus.FAILED, failureReason: String(reason).slice(0, 500) });
    await this.m.update(
      Product,
      { id: payment.productId, adStatus: ClassifiedStatus.PENDING_PAYMENT },
      { adStatus: ClassifiedStatus.DRAFT, status: productStatusFor(ClassifiedStatus.DRAFT) },
    );
    if (notify) {
      const ad = await this.m.findOne(Product, { where: { id: payment.productId }, select: ['id', 'name'] });
      await this.common.notify(payment.userId, 'payment_failed', { title: ad?.name ?? '' }, { adId: payment.productId, productId: payment.productId, paymentId: payment.id }, lang);
    }
  }

  private async succeed(payment: ClassifiedPayment, lang: string, extra: { transactionId?: string | null; transactionReference?: string | null }) {
    await this.m.update(ClassifiedPayment, { id: payment.id }, { status: ClassifiedPaymentStatus.SUCCESS, paidAt: new Date(), ...extra });
    const ad = await this.applyPlan(payment.id, lang);
    const key = ad?.adStatus === ClassifiedStatus.PENDING_REVIEW ? 'classified.paid_pending_review' : 'classified.published';
    return {
      message: this.common.t(key, lang),
      data: { payment: await this.m.findOne(ClassifiedPayment, { where: { id: payment.id } }), ad },
    };
  }

  /**
   * Applique le forfait payé (une seule fois) :
   * - 1re publication avec modération → PENDING_REVIEW (la durée démarre à la validation)
   * - sinon → ACTIVE (produit PUBLISHED) ; un renouvellement s'ajoute au temps restant.
   */
  async applyPlan(paymentId: string, lang: string): Promise<Product | null> {
    return this.common.dataSource.transaction(async (m) => {
      const lock = await m
        .createQueryBuilder()
        .update(ClassifiedPayment)
        .set({ applied: true })
        .where('id = :id AND applied = 0 AND status = :s', { id: paymentId, s: ClassifiedPaymentStatus.SUCCESS })
        .execute();
      const payment = await m.findOne(ClassifiedPayment, { where: { id: paymentId } });
      if (!payment) return null;
      const ad = await m.findOne(Product, { where: { id: payment.productId } });
      // Déjà appliqué (double confirmation) : on renvoie simplement l'annonce
      if (!lock.affected || !ad) return ad ?? null;

      const snap: any = payment.planSnapshot || {};
      const days = Number(snap.durationDays) || 30;
      const featured = !!snap.isFeatured;
      ad.adPlanId = payment.planId ?? null;
      ad.adPlanCode = snap.code ?? null;

      if (MODERATION_ENABLED && !ad.adReviewedAt) {
        ad.adStatus = ClassifiedStatus.PENDING_REVIEW;
        ad.status = productStatusFor(ClassifiedStatus.PENDING_REVIEW);
        ad.adPendingDays = (ad.adPendingDays || 0) + days;
        ad.adPendingFeatured = ad.adPendingFeatured || featured;
        await m.save(Product, ad);
        void this.common.notify(ad.ownerId!, 'pending_review', { title: ad.name }, { adId: ad.id, productId: ad.id }, lang);
        return ad;
      }
      this.activate(ad, days, featured);
      await m.save(Product, ad);
      void this.common.notify(ad.ownerId!, 'published', { title: ad.name, date: ad.adExpiresAt!.toISOString().slice(0, 10) }, { adId: ad.id, productId: ad.id }, lang);
      return ad;
    });
  }

  /** Met en ligne pour `days` jours (cumulés au temps restant) */
  activate(ad: Product, days: number, featured: boolean) {
    const now = new Date();
    const stillOnline = ad.adStatus === ClassifiedStatus.ACTIVE && ad.adExpiresAt && new Date(ad.adExpiresAt) > now;
    const start = stillOnline ? new Date(ad.adExpiresAt!) : now;
    ad.adExpiresAt = addDays(start, days);
    if (featured) {
      const fStart = ad.adFeaturedUntil && new Date(ad.adFeaturedUntil) > now ? new Date(ad.adFeaturedUntil) : now;
      ad.adFeaturedUntil = addDays(fStart, days);
    }
    ad.adStatus = ClassifiedStatus.ACTIVE;
    ad.status = productStatusFor(ClassifiedStatus.ACTIVE); // PUBLISHED
    ad.adPublishedAt = now; // remonte en tête des annonces récentes
    ad.adReminderSent = false;
    ad.adPendingDays = null;
    ad.adPendingFeatured = false;
  }

  // ============================================================
  // SUIVI DES PAIEMENTS MOBILE MONEY
  // ============================================================
  async checkStatus(paymentId: string, user: UserEntity, lang: string) {
    const payment = await this.m.findOne(ClassifiedPayment, { where: { id: paymentId } });
    if (!payment || (payment.userId !== user.id && !this.common.isAdmin(user))) {
      throw new NotFoundException(this.common.t('classified.payment_not_found', lang));
    }
    if (this.isTracked(payment)) await this.refreshPending(payment, lang);
    const current = await this.m.findOne(ClassifiedPayment, { where: { id: paymentId } });
    if (current?.failureReason) current.failureReason = current.failureReason.replace(TIMEOUT_MARK, '').trim();
    return {
      message: this.common.t('classified.payment_status', lang),
      data: {
        payment: current,
        ad: await this.findAd(payment.productId),
      },
    };
  }

  /** Paiement encore suivi : PENDING (ancien) ou échoué « non confirmé à temps » */
  private isTracked(payment: ClassifiedPayment): boolean {
    return (
      payment.status === ClassifiedPaymentStatus.PENDING ||
      (payment.status === ClassifiedPaymentStatus.FAILED && String(payment.failureReason || '').startsWith(TIMEOUT_MARK))
    );
  }

  private async refreshPending(payment: ClassifiedPayment, lang = 'fr') {
    const tooOld = Date.now() - new Date(payment.createdAt).getTime() > PENDING_MAX_HOURS * 3600000;
    const late = payment.status === ClassifiedPaymentStatus.FAILED; // déjà échoué « non confirmé à temps »
    const stopTracking = (reason: string) =>
      late
        ? this.m.update(ClassifiedPayment, { id: payment.id }, { failureReason: String(reason).replace(TIMEOUT_MARK, '').trim().slice(0, 500) })
        : this.fail(payment, reason, lang);

    if (payment.method !== ClassifiedPaymentMethod.MOBILE_MONEY || !payment.externalId) {
      if (tooOld || late) await stopTracking(this.common.t('classified.payment_expired', lang));
      return;
    }
    try {
      const res: any = await this.pawapay.checkDepositStatus(payment.externalId);
      const data = Array.isArray(res) ? res[0] : res?.data ?? res;
      const status = String(data?.status || '').toUpperCase();
      if (PAWAPAY_SUCCESS.includes(status)) {
        // ✅ Validé (même tard) : paiement réussi, forfait appliqué, annonce publiée
        const trace = await this.fpayTrace(payment, `Annonce — paiement ${payment.reference}`, lang);
        await this.succeed(payment, lang, trace);
      } else if (PAWAPAY_FAILED.includes(status)) {
        await stopTracking(data?.failureReason?.failureMessage || status);
      } else if (tooOld) {
        await stopTracking(this.common.t('classified.payment_expired', lang));
      }
    } catch (e: any) {
      this.logger.warn(`Vérification Pawapay ${payment.reference}: ${e?.message}`);
    }
  }

  /** ✅ Dépôts non confirmés à temps (et anciens PENDING) : rattrapage toutes les 2 minutes pendant 24 h */
  @Cron('0 */2 * * * *')
  async sweepPending() {
    const since = new Date(Date.now() - PENDING_MAX_HOURS * 3600000 - 3600000);
    const list = await this.m.find(ClassifiedPayment, {
      where: [
        { status: ClassifiedPaymentStatus.PENDING, createdAt: LessThan(new Date(Date.now() - 60000)) },
        { status: ClassifiedPaymentStatus.FAILED, failureReason: Like(`${TIMEOUT_MARK}%`), createdAt: MoreThan(since) },
      ],
      take: 50,
      order: { createdAt: 'ASC' },
    });
    for (const p of list) await this.refreshPending(p);
  }

  /** Expiration des annonces (produit repasse en PENDING) + rappel avant la fin — toutes les 10 minutes */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepExpirations() {
    const now = new Date();
    const expired = await this.m.find(Product, {
      where: { listingType: ListingType.CLASSIFIED, adStatus: ClassifiedStatus.ACTIVE, adDeleted: false, adExpiresAt: LessThan(now) },
      select: ['id', 'ownerId', 'name'],
      take: 500,
    });
    if (expired.length) {
      await this.m.update(
        Product,
        { id: In(expired.map((a) => a.id)) },
        { adStatus: ClassifiedStatus.EXPIRED, status: productStatusFor(ClassifiedStatus.EXPIRED), adFeaturedUntil: null },
      );
      for (const ad of expired) void this.common.notify(ad.ownerId!, 'expired', { title: ad.name }, { adId: ad.id, productId: ad.id });
    }

    const soon = await this.m
      .createQueryBuilder(Product, 'p')
      .select(['p.id', 'p.ownerId', 'p.name', 'p.adExpiresAt'])
      .where('p.listingType = :lt AND p.adStatus = :s AND p.adDeleted = 0 AND p.adReminderSent = 0', { lt: ListingType.CLASSIFIED, s: ClassifiedStatus.ACTIVE })
      .andWhere('p.adExpiresAt BETWEEN :now AND :limit', { now, limit: addDays(now, REMINDER_DAYS) })
      .take(500)
      .getMany();
    if (soon.length) {
      await this.m.update(Product, { id: In(soon.map((a) => a.id)) }, { adReminderSent: true });
      for (const ad of soon) {
        void this.common.notify(ad.ownerId!, 'expiring', { title: ad.name, date: new Date(ad.adExpiresAt!).toISOString().slice(0, 10) }, { adId: ad.id, productId: ad.id });
      }
    }
  }

  // ============================================================
  // ADMINISTRATION
  // ============================================================
  /** Paiement reçu hors application (espèces, agence) : l'admin applique le forfait */
  async manualPayment(productId: string, dto: ManualPaymentDto, admin: UserEntity, lang: string) {
    this.common.assertAdmin(admin, lang);
    const ad = await this.m.findOne(Product, { where: { id: productId, listingType: ListingType.CLASSIFIED, adDeleted: false } });
    if (!ad || !ad.ownerId) throw new NotFoundException(this.common.t('classified.not_found', lang));
    const plan = await this.m.findOne(ClassifiedPricingPlan, { where: { id: dto.planId } });
    if (!plan) throw new NotFoundException(this.common.t('classified.plan_not_found', lang));
    const payment = await this.m.save(
      ClassifiedPayment,
      this.m.create(ClassifiedPayment, {
        reference: reference('PAN'),
        productId,
        userId: ad.ownerId,
        planId: plan.id,
        planSnapshot: this.snapshot(plan),
        cityId: ad.adCityId ?? null,
        amount: Number(plan.price),
        transactionFee: 0,
        transactionFeeRate: 0,
        totalAmount: Number(plan.price),
        currency: plan.currency,
        method: ClassifiedPaymentMethod.MANUAL,
        status: ClassifiedPaymentStatus.PENDING,
        transactionReference: dto.reference ?? null,
        validatedById: admin.id,
      }),
    );
    return this.succeed(payment, lang, {});
  }
}
