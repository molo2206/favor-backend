import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { decimalNumber } from '../../common/decimal.transformer';
import { AssetCondition, AssetDisposalReason, AssetStatus } from '../../common/logistics.enums';
import { AssetCategory } from './asset-category.entity';

/** Bien de l'entreprise (patrimoine) : ordinateur, bureau, climatiseur, groupe électrogène… */
@Entity('bo_assets')
@Unique('uq_bo_asset_reference', ['companyId', 'reference'])
@Index('idx_bo_asset_company_status', ['companyId', 'status'])
@Index('idx_bo_asset_branch', ['branchId'])
@Index('idx_bo_asset_assignee', ['assignedToUserId'])
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  /** Code d'inventaire (étiquette collée sur le bien) */
  @Column({ type: 'varchar', length: 40 })
  reference: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  categoryId?: string | null;

  @ManyToOne(() => AssetCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category?: AssetCategory | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  serialNumber?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode?: string | null;

  /** Nombre d'unités (ex. 20 chaises enregistrées en un lot) */
  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'enum', enum: AssetStatus, default: AssetStatus.AVAILABLE })
  status: AssetStatus;

  @Column({ type: 'enum', enum: AssetCondition, default: AssetCondition.GOOD })
  condition: AssetCondition;

  /** Branche / site où se trouve le bien */
  @Column({ type: 'varchar', length: 36, nullable: true })
  branchId?: string | null;

  @ManyToOne(() => BranchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch?: BranchEntity | null;

  /** Emplacement précis (bureau, étage, magasin…) */
  @Column({ type: 'varchar', length: 150, nullable: true })
  location?: string | null;

  /** Employé qui utilise le bien */
  @Column({ type: 'varchar', length: 36, nullable: true })
  assignedToUserId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedToUserId' })
  assignedTo?: UserEntity | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  assignedAt?: Date | null;

  // ---------- Acquisition ----------
  @Column({ type: 'date', nullable: true })
  acquisitionDate?: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  acquisitionCost?: number | null;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  supplier?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  invoiceNumber?: string | null;

  @Column({ type: 'date', nullable: true })
  warrantyEndDate?: string | null;

  /** Durée d'amortissement (années) ; sinon celle de la catégorie */
  @Column({ type: 'int', nullable: true })
  depreciationYears?: number | null;

  // ---------- Sortie du patrimoine ----------
  @Column({ type: 'enum', enum: AssetDisposalReason, nullable: true })
  disposalReason?: AssetDisposalReason | null;

  @Column({ type: 'date', nullable: true })
  disposalDate?: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  disposalValue?: number | null;

  /** Dernier contrôle d'inventaire */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastCheckedAt?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
