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
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import {
  MediaCrewRole,
  MediaPaymentMethod,
  MediaPaymentStatus,
  MediaServiceCategory,
  MediaUnit,
  MediaVendorAssignmentStatus,
} from '../media.enums';
import { MediaProject } from './media-project.entity';
import { MediaSession } from './media-session.entity';
import { MediaVendor } from './media-vendor.entity';

/**
 * ✅ Mission confiée à un prestataire externe sur un projet (et éventuellement une séance) :
 * rôle, période, coût convenu, livraison, validation, évaluation, paiements.
 */
@Entity('bo_media_vendor_assignments')
@Index('idx_bo_media_va_vendor_period', ['vendorId', 'startAt'])
@Index('idx_bo_media_va_project', ['projectId'])
@Index('idx_bo_media_va_company_status', ['companyId', 'status'])
export class MediaVendorAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  vendorId: string;

  @ManyToOne(() => MediaVendor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vendorId' })
  vendor: MediaVendor;

  @Column({ type: 'varchar', length: 36 })
  projectId: string;

  @ManyToOne(() => MediaProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: MediaProject;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sessionId?: string | null;

  @ManyToOne(() => MediaSession, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sessionId' })
  session?: MediaSession | null;

  @Column({ type: 'enum', enum: MediaCrewRole, default: MediaCrewRole.OTHER })
  role: MediaCrewRole;

  @Column({ type: 'enum', enum: MediaServiceCategory, nullable: true })
  category?: MediaServiceCategory | null;

  /** Travail demandé (cahier des charges court) */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  description?: string | null;

  // ---------- Période ----------
  @Column({ type: 'datetime', precision: 6, nullable: true })
  startAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  endAt?: Date | null;

  /** Date limite de remise du travail (montage, retouche…) */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  dueAt?: Date | null;

  // ---------- Coût convenu ----------
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1, transformer: decimalNumber })
  quantity: number;

  @Column({ type: 'enum', enum: MediaUnit, default: MediaUnit.SESSION })
  unit: MediaUnit;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  unitCost: number;

  /** quantity × unitCost */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  amountPaid: number;

  @Column({ type: 'enum', enum: MediaPaymentStatus, default: MediaPaymentStatus.UNPAID })
  paymentStatus: MediaPaymentStatus;

  // ---------- Cycle ----------
  @Column({ type: 'enum', enum: MediaVendorAssignmentStatus, default: MediaVendorAssignmentStatus.PROPOSED })
  status: MediaVendorAssignmentStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  confirmedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  deliveredAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  validatedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cancelReason?: string | null;

  /** Lien du travail rendu (Drive, WeTransfer…) */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  deliveryUrl?: string | null;

  // ---------- Évaluation ----------
  /** Note globale 1 à 5 (à la validation) */
  @Column({ type: 'tinyint', nullable: true })
  rating?: number | null;

  /** Détail : { quality, punctuality, communication } sur 5 */
  @Column({ type: 'json', nullable: true })
  ratingDetails?: Record<string, number> | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  review?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}

/** Paiement versé à un prestataire (acompte ou solde d'une mission) */
@Entity('bo_media_vendor_payments')
@Index('idx_bo_media_vp_assignment', ['assignmentId'])
@Index('idx_bo_media_vp_vendor_date', ['vendorId', 'paidAt'])
@Index('idx_bo_media_vp_company_date', ['companyId', 'paidAt'])
export class MediaVendorPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  vendorId: string;

  @ManyToOne(() => MediaVendor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vendorId' })
  vendor: MediaVendor;

  @Column({ type: 'varchar', length: 36 })
  assignmentId: string;

  @ManyToOne(() => MediaVendorAssignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignmentId' })
  assignment: MediaVendorAssignment;

  @Column({ type: 'varchar', length: 36 })
  projectId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: MediaPaymentMethod, default: MediaPaymentMethod.CASH })
  method: MediaPaymentMethod;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference?: string | null;

  /** Facture / reçu du prestataire */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  receiptUrl?: string | null;

  @Column({ type: 'datetime', precision: 6 })
  paidAt: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  paidById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
