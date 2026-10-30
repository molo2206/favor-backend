import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum DriverWalletMovementType {
  /** Commission d'une course payée en espèces : débitée des gains Favor Help du chauffeur */
  CASH_COMMISSION = 'CASH_COMMISSION',
  /**
   * Commission d'une course payée en espèces : débitée du wallet F-Pay du chauffeur (route F-Pay taxi/driver/commission).
   * Suivi seulement : NE réduit PAS ses gains Favor Help (le prélèvement est fait dans F-Pay).
   */
  CASH_COMMISSION_FPAY = 'CASH_COMMISSION_FPAY',
}

/** Les deux sortes de commission espèces (gains Favor Help / wallet F-Pay) */
export const CASH_COMMISSION_TYPES: string[] = [
  DriverWalletMovementType.CASH_COMMISSION,
  DriverWalletMovementType.CASH_COMMISSION_FPAY,
];

export enum TaxiCreditStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  /** F-Pay a refusé ou n'a pas répondu : à relancer par un administrateur */
  FAILED = 'FAILED',
  /** Crédit F-Pay désactivé (RIDE_CASH_COMMISSION_FPAY_CREDIT=false) */
  DISABLED = 'DISABLED',
}

/**
 * ✅ Mouvements du portefeuille de gains d'un chauffeur (par devise), en plus des courses et des retraits.
 *
 *  Course payée en ESPÈCES et validée par le chauffeur :
 *    - amount = −commission → débitée de ses gains Favor Help (le solde peut devenir négatif = dette,
 *      remboursée automatiquement par ses prochaines courses payées dans l'application) ;
 *    - le compte F-Pay TAXI est crédité de la même commission (taxiCreditStatus).
 *  Index unique (rideId, type) : une course n'est jamais débitée deux fois.
 */
@Entity('driver_wallet_movements')
@Index('uq_driver_wallet_movement_ride_type', ['rideId', 'type'], { unique: true })
@Index('idx_driver_wallet_movement_driver', ['driverId', 'currency'])
@Index('idx_driver_wallet_movement_credit', ['taxiCreditStatus'])
export class DriverWalletMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  driverId: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'varchar', length: 30 })
  type: DriverWalletMovementType;

  /** Montant signé : négatif = débit du chauffeur */
  @Column('decimal', { precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  rideId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  /** Crédit du compte F-Pay TAXI */
  @Column({ type: 'varchar', length: 20, default: TaxiCreditStatus.PENDING })
  taxiCreditStatus: TaxiCreditStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  taxiTransactionId?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  taxiReference?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  taxiCreditError?: string | null;

  @Column({ type: 'int', default: 0 })
  taxiCreditAttempts: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  taxiCreditedAt?: Date | null;

  /** Qui a validé (chauffeur) / relancé (admin) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
