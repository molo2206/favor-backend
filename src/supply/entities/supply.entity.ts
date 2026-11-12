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
import { OrderEntity } from 'src/order/entities/order.entity';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { SupplyStatus } from '../enums/supply.enum';
import { SupplyHistory } from './supply-history.entity';

/**
 * Supply : lien entre une commande (ou la partie d'un vendeur = sous-commande)
 * et le shipment qui l'expédie.
 */
@Entity('supplies')
@Index('idx_supplies_order', ['orderId'])
@Index('idx_supplies_status', ['status'])
export class Supply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  reference: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @ManyToOne(() => OrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: OrderEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_supplies_sub_order')
  subOrderId?: string | null;

  @ManyToOne(() => SubOrderEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subOrderId' })
  subOrder?: SubOrderEntity | null;

  /** Boutique / vendeur qui expédie */
  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_supplies_company')
  companyId?: string | null;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'companyId' })
  company?: CompanyEntity | null;

  /** Client final */
  @Column({ type: 'varchar', length: 36, nullable: true })
  customerId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customerId' })
  customer?: UserEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_supplies_shipment')
  shipmentId?: string | null;

  @ManyToOne(() => Shipment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shipmentId' })
  shipment?: Shipment | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  originBranchId?: string | null;

  @ManyToOne(() => BranchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'originBranchId' })
  originBranch?: BranchEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  destinationBranchId?: string | null;

  @ManyToOne(() => BranchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'destinationBranchId' })
  destinationBranch?: BranchEntity | null;

  @Column({ type: 'enum', enum: SupplyStatus, default: SupplyStatus.PENDING })
  status: SupplyStatus;

  // ---------- Copie de la commande ----------
  @Column({ type: 'varchar', length: 100, nullable: true })
  invoiceNumber?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency?: string | null;

  @Column({ type: 'int', default: 0 })
  itemsCount: number;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: UserEntity | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  shipmentCreatedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  receivedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  cancelledAt?: Date | null;

  @OneToMany(() => SupplyHistory, (h) => h.supply)
  history: SupplyHistory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
