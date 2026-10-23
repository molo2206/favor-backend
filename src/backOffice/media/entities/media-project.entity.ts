import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { MediaPaymentStatus, MediaPriority, MediaProjectKind, MediaProjectStatus } from '../media.enums';
import { MediaProjectItem } from './media-project-item.entity';

/** Projet / commande média (couverture d'un mariage, spot publicitaire, campagne réseaux sociaux…) */
@Entity('bo_media_projects')
@Index('idx_bo_media_project_company_status', ['companyId', 'status'])
@Index('idx_bo_media_project_event', ['companyId', 'eventDate'])
export class MediaProject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  reference: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'enum', enum: MediaProjectKind, default: MediaProjectKind.EXTERNAL })
  kind: MediaProjectKind;

  // ---------- Client ----------
  /** Client inscrit sur la plateforme (optionnel) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  clientUserId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'clientUserId' })
  clientUser?: UserEntity | null;

  /** Projet interne : entreprise du groupe qui demande */
  @Column({ type: 'varchar', length: 36, nullable: true })
  clientCompanyId?: string | null;

  /** Projet interne : département demandeur (Commercial, RH…) */
  @Column({ type: 'varchar', length: 120, nullable: true })
  requestingDepartment?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  clientName?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  clientPhone?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  clientEmail?: string | null;

  // ---------- Projet ----------
  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** Type d'événement : mariage, conférence, anniversaire, publicité… */
  @Column({ type: 'varchar', length: 100, nullable: true })
  eventType?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  eventDate?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location?: string | null;

  /** Date limite de livraison */
  @Column({ type: 'date', nullable: true })
  dueDate?: string | null;

  @Column({ type: 'enum', enum: MediaProjectStatus, default: MediaProjectStatus.REQUEST })
  status: MediaProjectStatus;

  @Column({ type: 'enum', enum: MediaPriority, default: MediaPriority.NORMAL })
  priority: MediaPriority;

  /** Chef de projet */
  @Column({ type: 'varchar', length: 36, nullable: true })
  managerId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'managerId' })
  manager?: UserEntity | null;

  // ---------- Montants ----------
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  subtotal: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  discount: number;

  /** Taxe en % (ex. 16 = TVA 16 %) */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: decimalNumber })
  taxRate: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  total: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  amountPaid: number;

  @Column({ type: 'enum', enum: MediaPaymentStatus, default: MediaPaymentStatus.UNPAID })
  paymentStatus: MediaPaymentStatus;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  // ---------- Livraison au client ----------
  /** Lien de livraison (galerie privée) : /media/public/delivery/<token> */
  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  deliveryToken?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  deliveryTokenExpiresAt?: Date | null;

  // ---------- Étapes ----------
  @Column({ type: 'datetime', precision: 6, nullable: true })
  quotedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  confirmedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  deliveredAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cancelReason?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @OneToMany(() => MediaProjectItem, (i) => i.project)
  items: MediaProjectItem[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
