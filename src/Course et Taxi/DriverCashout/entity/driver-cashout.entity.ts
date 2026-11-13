import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';

/** Statut d'un retrait chauffeur */
export enum DriverCashoutStatus {
  /** Envoyé à F-Pay, réponse attendue */
  PROCESSING = 'PROCESSING',
  /** F-Pay a confirmé : argent envoyé sur le Mobile Money du chauffeur */
  SUCCESS = 'SUCCESS',
  /** Refusé par F-Pay : rien n'a été débité, le montant redevient disponible */
  FAILED = 'FAILED',
  /**
   * Pas de réponse fiable de F-Pay (délai dépassé, coupure) : le retrait a PEUT-ÊTRE eu lieu.
   * Le montant reste réservé et n'est jamais renvoyé automatiquement ; un administrateur vérifie dans F-Pay
   * puis le marque SUCCESS ou FAILED.
   */
  UNKNOWN = 'UNKNOWN',
}

/** Où l'argent est envoyé */
export enum DriverCashoutDestination {
  /** Mobile Money du chauffeur (payout Pawapay via F-Pay taxi/driver/cashout) */
  MOBILE_MONEY = 'MOBILE_MONEY',
  /** Compte F-Pay du chauffeur : recharge de son wallet F-Pay de la MÊME devise (F-Pay taxi/driver/topup) */
  FPAY = 'FPAY',
}

/** Statuts qui « consomment » le solde du chauffeur */
export const CASHOUT_RESERVED_STATUSES: string[] = [DriverCashoutStatus.PROCESSING, DriverCashoutStatus.SUCCESS, DriverCashoutStatus.UNKNOWN];

/**
 * ✅ Retrait des gains d'un chauffeur via F-Pay (route taxi/driver/cashout).
 * Solde disponible = gains des courses payées dans l'application − retraits réservés (PROCESSING, SUCCESS, UNKNOWN).
 */
@Entity('driver_cashouts')
@Index('idx_driver_cashout_driver', ['driverId', 'createdAt'])
@Index('idx_driver_cashout_status', ['status', 'createdAt'])
@Index('uq_driver_cashout_request', ['driverId', 'requestId'], { unique: true })
export class DriverCashout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Référence Favor Help du retrait (DCO-…) */
  @Column({ type: 'varchar', length: 40, unique: true })
  reference: string;

  @Column({ type: 'varchar', length: 36 })
  driverId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driverId' })
  driver?: UserEntity;

  /** Clé d'idempotence envoyée par l'appli (en-tête Idempotency-Key ou champ requestId) : une seule demande par clé */
  @Column({ type: 'varchar', length: 80, nullable: true })
  requestId?: string | null;

  @Column('decimal', { precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  /** Solde disponible juste avant la demande */
  @Column('decimal', { precision: 14, scale: 2, nullable: true })
  balanceBefore?: number | null;

  /** Moyen de paiement enregistré utilisé (user_payment_methods.id) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  paymentMethodId?: string | null;

  /** ✅ MOBILE_MONEY (payout Pawapay) ou FPAY (recharge du compte F-Pay du chauffeur, même devise) */
  @Column({ type: 'varchar', length: 20, default: DriverCashoutDestination.MOBILE_MONEY })
  destination: string;

  /** Opérateur Mobile Money (VODACOM_MPESA_COD, AIRTEL_COD, ORANGE_COD…) — « FPAY » pour un retrait vers le compte F-Pay */
  @Column({ type: 'varchar', length: 60 })
  provider: string;

  /** Numéro qui reçoit l'argent : Mobile Money, ou numéro du compte F-Pay du chauffeur (ex. 243970000000) */
  @Column({ type: 'varchar', length: 30 })
  phone: string;

  /** Compte F-Pay du chauffeur crédité (users.userIdFpay) — retrait FPAY */
  @Column({ type: 'varchar', length: 64, nullable: true })
  fpayAccountId?: string | null;

  /** Portefeuille Favor Help débité (driver_wallets.id, même devise) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  driverWalletId?: string | null;

  /** ✅ Wallet F-Pay DU CHAUFFEUR crédité (envoyé à F-Pay : { walletId, amount, pin }) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  walletId?: string | null;

  @Column({ type: 'varchar', length: 20, default: DriverCashoutStatus.PROCESSING })
  status: string;

  /** Transaction F-Pay */
  @Column({ type: 'varchar', length: 100, nullable: true })
  fpayTransactionId?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fpayReference?: string | null;

  /** Référence du payout Pawapay renvoyée par F-Pay (external_reference) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  fpayExternalReference?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  fpayStatus?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  fpayCurrency?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  fpayMessage?: string | null;

  /** Réponse brute de F-Pay (sans le PIN), pour le support */
  @Column({ type: 'json', nullable: true })
  fpayResponse?: any;

  @Column({ type: 'varchar', length: 500, nullable: true })
  failureReason?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  completedAt?: Date | null;

  /** Résolution manuelle d'un retrait UNKNOWN (administrateur) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  resolvedById?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  resolutionNote?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
