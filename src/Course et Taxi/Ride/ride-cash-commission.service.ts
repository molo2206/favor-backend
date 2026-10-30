import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Ride } from './entity/Ride.entity';
import { RideRealtimeService } from './ride-realtime.service';
import { RideHistoryService } from './ride-history.service';
import { RideEventType } from './enum/ride-event.enum';
import { FpayService } from 'src/fpay/fpay.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { I18nService } from 'src/libs/common/src';
import {
  DriverWalletMovement,
  DriverWalletMovementType,
  TaxiCreditStatus,
} from '../DriverCashout/entity/driver-wallet-movement.entity';
import { ensureDriverWallet } from '../DriverCashout/driver-wallet.util';

/**
 * ✅ Course payée en ESPÈCES, validée par le chauffeur (« espèces reçues ») :
 *   1. la commission de la course est DÉBITÉE de ses gains Favor Help (portefeuille de la devise de la course) ;
 *      solde insuffisant → le solde devient négatif (dette), remboursée par ses prochaines courses payées dans l'app ;
 *   2. le compte F-Pay TAXI est CRÉDITÉ de cette commission (même devise).
 *  Une seule fois par course (index unique rideId + type). Ne bloque jamais la validation du chauffeur :
 *  si F-Pay ne répond pas, le crédit reste « FAILED » et un administrateur le relance.
 *
 *  Réglages (.env) :
 *    RIDE_CASH_COMMISSION_DEBIT=false        → désactive tout (fonctionnement d'avant)
 *    RIDE_CASH_COMMISSION_METHODS=CASH       → modes concernés (ex. CASH,CARD)
 *    RIDE_CASH_COMMISSION_FPAY_CREDIT=false  → débit du chauffeur seulement, sans crédit F-Pay TAXI
 */
@Injectable()
export class RideCashCommissionService {
  private readonly logger = new Logger(RideCashCommissionService.name);
  /** Crédits F-Pay en cours (évite deux envois simultanés pour le même mouvement) */
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

  /**
   * Appelé après la validation « espèces reçues » par le chauffeur. Ne lève jamais d'erreur.
   * Renvoie le mouvement (créé ou déjà existant), ou null si la course n'est pas concernée.
   */
  async onCashConfirmed(ride: Ride, actorId: string | null, lang = 'fr'): Promise<DriverWalletMovement | null> {
    try {
      if (!this.isConcerned(ride)) return null;
      const currency = String(ride.currency || this.defaultCurrency()).toUpperCase();
      const commission = this.round2(Number(ride.commissionAmount));
      const ref = ride.id.slice(0, 8).toUpperCase();

      // 1️⃣ Débit des gains (une seule fois : INSERT IGNORE sur l'index unique rideId + type)
      await ensureDriverWallet(this.movementRepo.manager, ride.driverId, currency, ride.id);
      const res: any = await this.movementRepo
        .createQueryBuilder()
        .insert()
        .into(DriverWalletMovement)
        .values({
          id: randomUUID(),
          driverId: ride.driverId!,
          currency,
          type: DriverWalletMovementType.CASH_COMMISSION,
          amount: -commission as any,
          rideId: ride.id,
          description: `Commission course #${ref} payée en espèces`,
          taxiCreditStatus: this.fpayCreditEnabled ? TaxiCreditStatus.PENDING : TaxiCreditStatus.DISABLED,
          taxiCreditAttempts: 0,
          createdById: actorId,
        })
        .orIgnore()
        .execute();

      const inserted = Number(res?.raw?.affectedRows ?? res?.identifiers?.length ?? 0) > 0;
      const movement = await this.movementRepo.findOne({
        where: { rideId: ride.id, type: DriverWalletMovementType.CASH_COMMISSION },
      });
      if (!movement) return null;
      if (!inserted) return movement; // déjà traité (validation répétée)

      await this.history
        .record(ride.id, {
          type: RideEventType.CASH_COMMISSION_DEBITED,
          actorId,
          actorRole: 'DRIVER',
          payload: { cashCommissionDebited: commission, currency, movementId: movement.id },
        })
        .catch(() => undefined);

      // Notification au chauffeur
      await this.realtime
        .notify({
          userIds: [ride.driverId!],
          audience: 'driver',
          key: 'cash_commission_debited',
          params: { amount: commission, currency, ref },
          type: NotificationType.RIDE_PAYMENT,
          rideId: ride.id,
          payload: { rideId: ride.id, commission, currency, movementId: movement.id },
          push: 'offline',
          lang,
        })
        .catch(() => undefined);

      // 2️⃣ Crédit du compte F-Pay TAXI
      if (this.fpayCreditEnabled) return await this.creditTaxi(movement, lang);
      return movement;
    } catch (e: any) {
      this.logger.error(`Commission espèces (course ${ride?.id}) non enregistrée : ${e?.message}`);
      return null;
    }
  }

  /** Crédite le compte F-Pay TAXI de la commission (jamais deux fois pour le même mouvement) */
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
   * Admin : relancer le crédit F-Pay TAXI d'une commission en échec.
   * ⚠️ Vérifier d'abord dans F-Pay que la commission n'a pas déjà été créditée (réponse perdue).
   */
  async retryCredit(id: string, adminId: string, lang = 'fr') {
    const movement = await this.movementRepo.findOne({ where: { id } });
    if (!movement) throw new NotFoundException(this.t('ride.cash_commission.not_found', lang));
    if (movement.taxiCreditStatus === TaxiCreditStatus.SUCCESS) {
      return { message: this.t('ride.cash_commission.already_credited', lang), data: movement };
    }
    if (!this.fpayCreditEnabled) throw new BadRequestException(this.t('ride.cash_commission.credit_disabled', lang));
    movement.createdById = movement.createdById ?? adminId;
    const saved = await this.creditTaxi(movement, lang);
    const ok = saved.taxiCreditStatus === TaxiCreditStatus.SUCCESS;
    return {
      message: this.t(ok ? 'ride.cash_commission.credited' : 'ride.cash_commission.credit_failed', lang, {
        reason: saved.taxiCreditError ?? '',
      }),
      data: saved,
    };
  }
}
