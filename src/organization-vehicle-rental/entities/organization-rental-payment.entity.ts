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
import { OrganizationVehicleRental } from './organization-vehicle-rental.entity';
import {
  OrganizationRentalPaymentMethod,
  OrganizationRentalPaymentStatus,
} from '../enums/organization-rental.enum';

/**
 * ✅ Paiement d'une réservation organisation (APRÈS prestation).
 *  - Référence unique par transaction (anti-double paiement).
 *  - FPAY / MOBILE_MONEY : confirmé par le mécanisme de paiement (flux classified-payment).
 *  - CASH : enregistré/confirmé par un admin (espèces).
 *  - Plusieurs lignes par réservation = historique ; une seule SUCCESS.
 */
@Entity('organization_rental_payments')
@Index('idx_orp_rental', ['rentalId'])
@Index('idx_orp_status', ['status'])
export class OrganizationRentalPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_orp_reference', { unique: true })
  @Column({ type: 'varchar', length: 60 })
  reference: string;

  @Column({ type: 'varchar', length: 36 })
  rentalId: string;

  @ManyToOne(() => OrganizationVehicleRental, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rentalId' })
  rental?: OrganizationVehicleRental | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({
    type: 'enum',
    enum: OrganizationRentalPaymentMethod,
    default: OrganizationRentalPaymentMethod.CASH,
  })
  method: OrganizationRentalPaymentMethod;

  @Column({
    type: 'enum',
    enum: OrganizationRentalPaymentStatus,
    default: OrganizationRentalPaymentStatus.PENDING,
  })
  status: OrganizationRentalPaymentStatus;

  /** Mode de paiement enregistré du payeur (UserPaymentMethod.id), si applicable */
  @Column({ type: 'varchar', length: 36, nullable: true })
  paymentMethodId?: string | null;

  /** Référence renvoyée par le fournisseur (F-Pay / Mobile Money) */
  @Column({ type: 'varchar', length: 120, nullable: true })
  providerReference?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  paidAt?: Date | null;

  /** Payeur (organisation locataire) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  payerId?: string | null;

  /** Bénéficiaire (propriétaire du véhicule) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  beneficiaryId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  failureReason?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
