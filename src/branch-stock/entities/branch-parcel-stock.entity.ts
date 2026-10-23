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
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { BranchStockStatus } from '../enums/branch-stock.enum';
import { BranchParcelMovement } from './branch-parcel-movement.entity';

/**
 * Stock d'un colis (shipment) dans une branche.
 * Les quantités sont en pièces (package.external_quantity).
 */
@Entity('branch_parcel_stocks')
@Unique('uq_bps_branch_shipment', ['branchId', 'shipmentId'])
@Index('idx_bps_branch_status', ['branchId', 'status'])
export class BranchParcelStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  branchId: string;

  @ManyToOne(() => BranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch: BranchEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId?: string | null;

  @Column({ type: 'varchar', length: 36 })
  @Index('idx_bps_shipment')
  shipmentId: string;

  @ManyToOne(() => Shipment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipmentId' })
  shipment: Shipment;

  @Column({ type: 'varchar', length: 36, nullable: true })
  ltaId?: string | null;

  @ManyToOne(() => LtaEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ltaId' })
  lta?: LtaEntity | null;

  /** Copie au moment de la réception (recherche rapide) */
  @Column({ type: 'varchar', length: 100 })
  trackingNumber: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  clientName?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  clientPhone?: string | null;

  /** Total entré dans la branche (réceptions + transferts reçus + corrections +) */
  @Column({ type: 'int', default: 0 })
  quantityIn: number;

  /** Total sorti (retraits + transferts envoyés + diminutions + corrections -) */
  @Column({ type: 'int', default: 0 })
  quantityOut: number;

  /** Stock restant = quantityIn - quantityOut */
  @Column({ type: 'int', default: 0 })
  quantityAvailable: number;

  @Column({ type: 'enum', enum: BranchStockStatus, default: BranchStockStatus.IN_STOCK })
  status: BranchStockStatus;

  /** Emplacement dans le dépôt (rayon, étagère…) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  location?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  firstReceivedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastMovementAt?: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  receivedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receivedById' })
  receivedBy?: UserEntity | null;

  @OneToMany(() => BranchParcelMovement, (m) => m.stock)
  movements: BranchParcelMovement[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
