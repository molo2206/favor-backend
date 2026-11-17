import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { AssetAssignmentStatus } from '../../common/logistics.enums';
import { Asset } from './asset.entity';

/**
 * ✅ Remise d'une QUANTITÉ d'un bien à un employé (sortie partielle possible) :
 * ex. 2 chaises sur un lot de 10. Une ligne par employé et par bien tant que la remise est active.
 */
@Entity('bo_asset_assignments')
@Index('idx_bo_asset_assignment_asset', ['assetId', 'status'])
@Index('idx_bo_asset_assignment_user', ['userId', 'status'])
@Index('idx_bo_asset_assignment_company', ['companyId', 'status'])
export class AssetAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  assetId: string;

  @ManyToOne(() => Asset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset: Asset;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  /** Quantité remise (cumulée) */
  @Column({ type: 'int', default: 1 })
  quantity: number;

  /** Quantité déjà rendue */
  @Column({ type: 'int', default: 0 })
  returnedQuantity: number;

  @Column({ type: 'enum', enum: AssetAssignmentStatus, default: AssetAssignmentStatus.ACTIVE })
  status: AssetAssignmentStatus;

  /** Demande de matériel à l'origine de la sortie */
  @Column({ type: 'varchar', length: 36, nullable: true })
  requestId?: string | null;

  @Column({ type: 'datetime', precision: 6 })
  assignedAt: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  returnedAt?: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  assignedById?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  /** Photo à la remise (bon signé, état du matériel…) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
