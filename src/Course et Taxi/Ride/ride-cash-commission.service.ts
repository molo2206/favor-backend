import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Ride } from './entity/Ride.entity';
import { RideRealtimeService } from './ride-realtime.service';
import { RideHistoryService } from './ride-history.service';
import { RideEventType } from './enum/ride-event.enum';
import { FpayService } from 'src/fpay/fpay.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { I18nService } from 'src/libs/common/src';
import {
  CASH_COMMISSION_TYPES,
  DriverWalletMovement,
  DriverWalletMovementType,
  TaxiCreditStatus,
} from '../DriverCashout/entity/driver-wallet-movement.entity';
import { ensureDriverWallet } from '../DriverCashout/driver-wallet.util';

/**
 * ✅ Course payée en ESPÈCES, validée par le chauffeur (« espèces reçues ») — une seule fois par course.
 *
 *  Mode F-Pay (défaut, RIDE_CASH_COMMISSION_SOURCE=FPAY) :
 *    la commission est DÉBITÉE du wallet F-Pay du chauffeur et CRÉDITÉE au compte F-Pay TAXI
 *    (route F-Pay taxi/driver/commission, une seule opération). Solde insuffisant → solde F-Pay NÉGATIF (dette),
 *    remboursée automatiquement par ses prochains crédits F-Pay (retraits de ses gains…).
 *    Le mouvement enregistré ici (type CASH_COMMISSION_FPAY) sert au suivi : il NE réduit PAS ses gains Favor Help.
 *
 *  Chauffeur sans compte F-Pay lié, ou RIDE_CASH_COMMISSION_SOURCE=GAINS :
 *    la commission est débitée de ses gains Favor Help (type CASH_COMMISSION, dette possible)
 *    et le compte F-Pay TAXI est crédité (route pay/mobile_money).
 *
 *  Ne bloque jamais la validation du chauffeur : si F-Pay ne répond pas, l'opération reste « FAILED »
 *  et un administrateur la relance (sans risque de double prélèvement en mode F-Pay : F-Pay reconnaît la course).
 *
 *  Réglages (.env) :
 *    RIDE_CASH_COMMISSION_DEBIT=false        → désactive tout (fonctionnement d'avant)
 *    RIDE_CASH_COMMISSION_METHODS=CASH       → modes concernés (ex. CASH,CARD)
 *    RIDE_CASH_COMMISSION_SOURCE=FPAY|GAINS  → wallet F-Pay du chauffeur (défaut) ou gains Favor Help
 *    RIDE_CASH_COMMISSION_FPAY_CREDIT=false  → mode GAINS : débit des gains seulement, sans crédit F-Pay TAXI
 */
@Injectable()
export class RideCashCommissionService {
  private readonly logger = new Logger(RideCashCommissionService.name);
  /** Opérations F-Pay en cours (évite deux envois simultanés pour le même mouvement) */
  private readonly crediting = new Set<string>();

  constructor(
    @InjectRepository(DriverWalletMovement)
    private readonly movementRepo: Repository<DriverWalletMovement>,
    private readonly fpay: FpayService,
    private readonly realtime: RideRealtimeService,
    private readonly history: RideHistoryService,
    private readonly i18n: I18nService,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.i18n.translate(key, lang, params);
  }

  private round2(n: number) {
    return Math.round(Number(n || 0) * 100) / 100;
  }

  private get enabled(): boolean {
    return String(process.env.RIDE_CASH_COMMISSION_DEBIT ?? 'true').toLowerCase() !== 'false';
  }

  /** FPAY (défaut) : wallet F-Pay du chauffeur ; GAINS : gains Favor Help */
  private get source(): 'FPAY' | 'GAINS' {
    return String(process.env.RIDE_CASH_COMMISSION_SOURCE || 'FPAY').toUpperCase() === 'GAINS' ? 'GAINS' : 'FPAY';
  }

  private get fpayCreditEnabled(): boolean {
    return String(process.env.RIDE_CASH_COMMISSION_FPAY_CREDIT ?? 'true').toLowerCase() !== 'false';
  }

  private get methods(): string[] {
    return String(process.env.RIDE_CASH_COMMISSION_METHODS || 'CASH')
      .split(',')
      .map((m) => m.trim().toUpperCase())
      .filter(Boolean);
  }

  private defaultCurrency(): string {
    return String(process.env.RIDE_PRICING_CURRENCY || 'USD').toUpperCase();
  }

  /** La course est-elle concernée (espèces + commission > 0) ? */
  isConcerned(ride: Ride): boolean {
    const method = String(ride.paymentMethod || 'CASH').toUpperCase();
    return this.enabled && !!ride.driverId && this.methods.includes(method) && Number(ride.commissionAmount || 0) > 0;
  }

  /** Compte F-Pay du chauffeur (users.userIdFpay) */
  private async driverFpayId(driverId: string): Promise<string | null> {
    const rows: any[] = await this.movementRepo.query('SELECT userIdFpay FROM users WHERE id = ? LIMIT 1', [driverId]);
    const id = rows?.[0]?.userIdFpay;
    return id ? String(id) : null;
  }

  /**
   * Appelé après la validation « espèces reçues » par le chauffeur. Ne lève jamais d'erreur.
   * Renvoie le mouvement (créé ou déjà existant), ou null si la course n'est pas concernée.
   */
  async onCashConfirmed(ride: Ride, actorId: string | null, lang = 'fr'): Promise<DriverWalletMovement | null> {
    try {
      if (!this.isConcerned(ride)) return null;

      // Une seule fois par course, quel que soit le mode
      const existing = await this.movementRepo.findOne({ where: { rideId: ride.id, type: In(CASH_COMMISSION_TYPES) } });
      if (existing) return existing;

      const currency = String(ride.currency || this.defaultCurrency()).toUpperCase();
      const commission = this.round2(Number(ride.commissionAmount));
      const ref = ride.id.slice(0, 8).toUpperCase();

      // Mode : wallet F-Pay du chauffeur si son compte F-Pay est lié, sinon ses gains Favor Help
      const fpayUserId = this.source === 'FPAY' ? await this.driverFpayId(ride.driverId!) : null;
      if (this.source === 'FPAY' && !fpayUserId) {
        this.logger.warn(`Chauffeur ${ride.driverId} sans compte F-Pay lié : commission de la course ${ride.id} débitée de ses gains Favor Help`);
      }
      const viaFpay = !!fpayUserId;
      const type = viaFpay ? DriverWalletMovementType.CASH_COMMISSION_FPAY : DriverWalletMovementType.CASH_COMMISSION;

      // 1️⃣ Mouvement (INSERT IGNORE sur l'index unique rideId + type)
      if (!viaFpay) await ensureDriverWallet(this.movementRepo.manager, ride.driverId, currency, ride.id);
      const res: any = await this.movementRepo
        .createQueryBuilder()
        .insert()
        .into(DriverWalletMovement)
        .values({
          id: randomUUID(),
          driverId: ride.driverId!,
          currency,
          type,
          amount: -commission as any,
          rideId: ride.id,
          description: viaFpay
            ? `Commission course #${ref} payée en espèces — débitée du wallet F-Pay`
            : `Commission course #${ref} payée en espèces`,
          taxiCreditStatus: viaFpay || this.fpayCreditEnabled ? TaxiCreditStatus.PENDING : TaxiCreditStatus.DISABLED,
          taxiCreditAttempts: 0,
          createdById: actorId,
        })
        .orIgnore()
        .execute();

      const inserted = Number(res?.raw?.affectedRows ?? res?.identifiers?.length ?? 0) > 0;
      let movement = await this.movementRepo.findOne({ where: { rideId: ride.id, type } });
      if (!movement) return null;
      if (!inserted) return movement; // déjà traité (validation répétée)

      // 2️⃣ Opération F-Pay
      if (viaFpay) movement = await this.chargeFpay(movement, fpayUserId!, lang);
      else if (this.fpayCreditEnabled) movement = await this.creditTaxi(movement, lang);

      await this.history
        .record(ride.id, {
          type: RideEventType.CASH_COMMISSION_DEBITED,
          actorId,
          actorRole: 'DRIVER',
          payload: {
            cashCommissionDebited: commission,
            currency,
            movementId: movement.id,
            source: viaFpay ? 'FPAY' : 'GAINS',
            status: movement.taxiCreditStatus,
          },
        })
        .catch(() => undefined);

      // Notification au chauffeur (débit F-Pay : seulement s'il a réussi)
      if (!viaFpay || movement.taxiCreditStatus === TaxiCreditStatus.SUCCESS) {
        await this.realtime
          .notify({
            userIds: [ride.driverId!],
            audience: 'driver',
            key: viaFpay ? 'cash_commission_debited_fpay' : 'cash_commission_debited',
            params: { amount: commission, currency, ref },
            type: NotificationType.RIDE_PAYMENT,
            rideId: ride.id,
            payload: { rideId: ride.id, commission, currency, movementId: movement.id, source: viaFpay ? 'FPAY' : 'GAINS' },
            push: 'offline',
            lang,
          })
          .catch(() => undefined);
      }
      return movement;
    } catch (e: any) {
      this.logger.error(`Commission espèces (course ${ride?.id}) non enregistrée : ${e?.message}`);
      return null;
    }
  }

  /**
   * Mode F-Pay : débit du wallet F-Pay du chauffeur → crédit du compte TAXI (une seule opération F-Pay).
   * F-Pay ne prélève qu'une fois par course : une relance est sans risque.
   */
  private async chargeFpay(movement: DriverWalletMovement, fpayUserId: string, lang: string): Promise<DriverWalletMovement> {
    if (this.crediting.has(movement.id)) return movement;
    this.crediting.add(movement.id);
    try {
      const fresh = await this.movementRepo.findOne({ where: { id: movement.id } });
      if (!fresh || fresh.taxiCreditStatus === TaxiCreditStatus.SUCCESS) return fresh ?? movement;

      const amount = Math.abs(Number(fresh.amount));
      const ref = String(fresh.rideId || fresh.id).slice(0, 8).toUpperCase();
      fresh.taxiCreditAttempts = (fresh.taxiCreditAttempts || 0) + 1;
      try {
        const r: any = await this.fpay.taxiDriverCommission({
          amount,
          currency: fresh.currency,
          driverUserId: fpayUserId,
          rideId: String(fresh.rideId),
          description: `Commission course taxi #${ref} (espèces)`,
          paymentMethod: 'CASH',
          lang,
        });
        const tx = r?.data?.transaction;
        if (tx?.status === 'SUCCESS' || r?.data?.replayed) {
          fresh.taxiCreditStatus = TaxiCreditStatus.SUCCESS;
          fresh.taxiTransactionId = tx?.id ?? null;
          fresh.taxiReference = tx?.reference ?? null;
          fresh.taxiCreditError = null;
          fresh.taxiCreditedAt = new Date();
          const debt = Number(r?.data?.driverDebt ?? 0);
          if (debt > 0) fresh.description = `${fresh.description} — solde F-Pay négatif (dette ${debt} ${fresh.currency})`.slice(0, 255);
        } else {
          fresh.taxiCreditStatus = TaxiCreditStatus.FAILED;
          fresh.taxiCreditError = `Réponse F-Pay sans succès (${tx?.status ?? 'aucun statut'})`;
        }
      } catch (e: any) {
        fresh.taxiCreditStatus = TaxiCreditStatus.FAILED;
        fresh.taxiCreditError = String(e?.response?.message || e?.message || 'Erreur F-Pay').slice(0, 500);
        this.logger.error(`Commission F-Pay (course ${fresh.rideId}) non prélevée : ${fresh.taxiCreditError}`);
      }
      return await this.movementRepo.save(fresh);
    } finally {
      this.crediting.delete(movement.id);
    }
  }

  /** Mode gains Favor Help : crédite le compte F-Pay TAXI de la commission (jamais deux fois pour le même mouvement) */
  private async creditTaxi(movement: DriverWalletMovement, lang: string): Promise<DriverWalletMovement> {
    if (this.crediting.has(movement.id)) return movement;
    this.crediting.add(movement.id);
    try {
      const fresh = await this.movementRepo.findOne({ where: { id: movement.id } });
      if (!fresh || fresh.taxiCreditStatus === TaxiCreditStatus.SUCCESS) return fresh ?? movement;

      const amount = Math.abs(Number(fresh.amount));
      const ref = String(fresh.rideId || fresh.id).slice(0, 8).toUpperCase();
      fresh.taxiCreditAttempts = (fresh.taxiCreditAttempts || 0) + 1;
      try {
        const r: any = await this.fpay.payWithMobileMoneyTaxi(
          amount,
          fresh.currency,
          `Commission course taxi #${ref} (espèces) — course ${fresh.rideId}`,
          'CASH',
          undefined,
          lang,
        );
        const tx = r?.data?.transaction;
        if (tx?.status === 'SUCCESS') {
          fresh.taxiCreditStatus = TaxiCreditStatus.SUCCESS;
          fresh.taxiTransactionId = tx.id ?? null;
          fresh.taxiReference = tx.reference ?? null;
          fresh.taxiCreditError = null;
          fresh.taxiCreditedAt = new Date();
        } else {
          fresh.taxiCreditStatus = TaxiCreditStatus.FAILED;
          fresh.taxiCreditError = `Réponse F-Pay sans succès (${tx?.status ?? 'aucun statut'})`;
        }
      } catch (e: any) {
        fresh.taxiCreditStatus = TaxiCreditStatus.FAILED;
        fresh.taxiCreditError = String(e?.response?.message || e?.message || 'Erreur F-Pay').slice(0, 500);
        this.logger.error(`Crédit compte TAXI (commission ${fresh.id}) non effectué : ${fresh.taxiCreditError}`);
      }
      return await this.movementRepo.save(fresh);
    } finally {
      this.crediting.delete(movement.id);
    }
  }

  /**
   * Admin : relancer une commission en échec.
   *  - mode F-Pay : relance sans risque (F-Pay ne prélève qu'une fois par course) ;
   *  - mode gains : ⚠️ vérifier d'abord dans F-Pay que le crédit TAXI n'est pas déjà passé (réponse perdue).
   */
  async retryCredit(id: string, adminId: string, lang = 'fr') {
    const movement = await this.movementRepo.findOne({ where: { id } });
    if (!movement) throw new NotFoundException(this.t('ride.cash_commission.not_found', lang));
    if (movement.taxiCreditStatus === TaxiCreditStatus.SUCCESS) {
      return { message: this.t('ride.cash_commission.already_credited', lang), data: movement };
    }
    movement.createdById = movement.createdById ?? adminId;

    let saved: DriverWalletMovement;
    if (movement.type === DriverWalletMovementType.CASH_COMMISSION_FPAY) {
      const fpayUserId = await this.driverFpayId(movement.driverId);
      if (!fpayUserId) throw new BadRequestException(this.t('ride.cash_commission.no_fpay_account', lang));
      saved = await this.chargeFpay(movement, fpayUserId, lang);
    } else {
      if (!this.fpayCreditEnabled) throw new BadRequestException(this.t('ride.cash_commission.credit_disabled', lang));
      saved = await this.creditTaxi(movement, lang);
    }

    const ok = saved.taxiCreditStatus === TaxiCreditStatus.SUCCESS;
    return {
      message: this.t(ok ? 'ride.cash_commission.credited' : 'ride.cash_commission.credit_failed', lang, {
        reason: saved.taxiCreditError ?? '',
      }),
      data: saved,
    };
  }
}
