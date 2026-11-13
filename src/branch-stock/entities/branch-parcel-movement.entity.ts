import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { BranchMovementType } from '../enums/branch-stock.enum';
import { BranchParcelStock } from './branch-parcel-stock.entity';

/**
 * Pointage : chaque entrée / sortie de colis dans une branche.
 * Jamais modifié ni supprimé (historique complet).
 */
@Entity('branch_parcel_movements')
@Index('idx_bpm_branch_date', ['branchId', 'createdAt'])
export class BranchParcelMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('idx_bpm_stock')
  stockId: string;

  @ManyToOne(() => BranchParcelStock, (s) => s.movements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stockId' })
  stock: BranchParcelStock;

  @Column({ type: 'varchar', length: 36 })
  branchId: string;

  @ManyToOne(() => BranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch: BranchEntity;

  @Column({ type: 'varchar', length: 36 })
  @Index('idx_bpm_shipment')
  shipmentId: string;

  @ManyToOne(() => Shipment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipmentId' })
  shipment: Shipment;

  @Column({ type: 'enum', enum: BranchMovementType })
  type: BranchMovementType;

  /** Toujours positif ; le sens dépend du type */
  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int' })
  quantityBefore: number;

  @Column({ type: 'int' })
  quantityAfter: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** Référence liée : transfert, LTA, retrait PIN… */
  @Column({ type: 'varchar', length: 100, nullable: true })
  reference?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  transferId?: string | null;

  /** Personne qui a retiré le colis */
  @Column({ type: 'varchar', length: 150, nullable: true })
  recipientName?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  recipientPhone?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  performedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performedById' })
  performedBy?: UserEntity | null;

  @CreateDateColumn()
  createdAt: Date;
}
