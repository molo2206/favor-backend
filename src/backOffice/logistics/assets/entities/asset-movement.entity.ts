import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { decimalNumber } from '../../common/decimal.transformer';
import { AssetMovementType } from '../../common/logistics.enums';
import { Asset } from './asset.entity';

/** Historique d'un bien : entrée, affectation, retour, transfert, réparation, inventaire, sortie… */
@Entity('bo_asset_movements')
@Index('idx_bo_asset_mvt_asset_date', ['assetId', 'createdAt'])
@Index('idx_bo_asset_mvt_company_date', ['companyId', 'createdAt'])
export class AssetMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  assetId: string;

  @ManyToOne(() => Asset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset: Asset;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'enum', enum: AssetMovementType })
  type: AssetMovementType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  fromBranchId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  toBranchId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  fromUserId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  toUserId?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fromStatus?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  toStatus?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fromCondition?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  toCondition?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  location?: string | null;

  /** Coût lié (réparation) ou valeur (vente) */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  amount?: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  performedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performedById' })
  performedBy?: UserEntity | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
