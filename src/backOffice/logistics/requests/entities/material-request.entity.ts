import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { MaterialRequestPriority, MaterialRequestStatus } from '../../common/logistics.enums';
import { MaterialRequestItem } from './material-request-item.entity';

/**
 * ✅ Demande de matériel : l'employé demande → le logisticien valide (quantités) → il sort le matériel
 * (remises bo_asset_assignments liées à la demande) → bon de sortie.
 */
@Entity('bo_material_requests')
@Unique('uq_bo_material_request_reference', ['companyId', 'reference'])
@Index('idx_bo_material_request_status', ['companyId', 'status'])
@Index('idx_bo_material_request_requester', ['requesterId', 'status'])
export class MaterialRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  /** DEM-20261024-12345 */
  @Column({ type: 'varchar', length: 30 })
  reference: string;

  @Column({ type: 'varchar', length: 36 })
  requesterId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requesterId' })
  requester: UserEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  branchId?: string | null;

  @ManyToOne(() => BranchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch?: BranchEntity | null;

  /** Motif / usage prévu */
  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({ type: 'enum', enum: MaterialRequestPriority, default: MaterialRequestPriority.NORMAL })
  priority: MaterialRequestPriority;

  /** Date souhaitée */
  @Column({ type: 'date', nullable: true })
  neededBy?: string | null;

  @Column({ type: 'enum', enum: MaterialRequestStatus, default: MaterialRequestStatus.PENDING })
  status: MaterialRequestStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewedById' })
  reviewedBy?: UserEntity | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  reviewedAt?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reviewNote?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  issuedAt?: Date | null;

  /** Image jointe par le demandeur (photo du matériel souhaité, bon…) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl?: string | null;

  @OneToMany(() => MaterialRequestItem, (i) => i.request)
  items: MaterialRequestItem[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
