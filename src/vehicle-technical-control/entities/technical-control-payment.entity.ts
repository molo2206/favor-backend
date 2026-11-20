import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VehicleTechnicalControl } from './vehicle-technical-control.entity';
import { TechnicalControlPaymentStatus } from '../enums/technical-control.enum';

/**
 * ✅ Paiement d'un contrôle technique.
 *  - Référence unique par transaction (anti-double-facturation).
 *  - Statut confirmé UNIQUEMENT par le mécanisme de paiement (F-Pay / mode de paiement),
 *    jamais sur simple déclaration.
 *  - Plusieurs lignes possibles par contrôle = historique des tentatives ; une seule CONFIRMED.
 */
@Entity('technical_control_payments')
@Index('idx_tcp_control', ['controlId'])
@Index('idx_tcp_status', ['status'])
export class TechnicalControlPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Référence unique de la transaction */
  @Index('uq_tcp_reference', { unique: true })
  @Column({ type: 'varchar', length: 60 })
  reference: string;

  @Column({ type: 'varchar', length: 36 })
  controlId: string;

  @ManyToOne(() => VehicleTechnicalControl, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'controlId' })
  control?: VehicleTechnicalControl | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  /** Mode de paiement (FPAY / MOBILE_MONEY / CASH…) — réutilise les modes existants */
  @Column({ type: 'varchar', length: 30, nullable: true })
  paymentMethod?: string | null;

  /** Référence du mode de paiement du payeur (UserPaymentMethod.id) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  paymentMethodId?: string | null;

  /** Référence renvoyée par le fournisseur de paiement (ex. F-Pay) */
  @Column({ type: 'varchar', length: 120, nullable: true })
  providerReference?: string | null;

  @Column({
    type: 'enum',
    enum: TechnicalControlPaymentStatus,
    default: TechnicalControlPaymentStatus.PENDING,
  })
  status: TechnicalControlPaymentStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  paidAt?: Date | null;

  /** Payeur (généralement le propriétaire) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  payerId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
