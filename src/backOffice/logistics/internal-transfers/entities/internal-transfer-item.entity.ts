import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { BranchParcelStock } from 'src/branch-stock/entities/branch-parcel-stock.entity';
import { InternalTransfer } from './internal-transfer.entity';

/** Ligne d'un transfert : un colis (shipment) et le nombre de pièces envoyées */
@Entity('bo_logistics_transfer_items')
@Index('idx_bo_transfer_item_transfer', ['transferId'])
@Index('idx_bo_transfer_item_shipment', ['shipmentId'])
export class InternalTransferItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  transferId: string;

  @ManyToOne(() => InternalTransfer, (t) => t.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transferId' })
  transfer: InternalTransfer;

  /** Ligne de stock de la branche d'origine */
  @Column({ type: 'varchar', length: 36 })
  stockId: string;

  @ManyToOne(() => BranchParcelStock, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stockId' })
  stock: BranchParcelStock;

  @Column({ type: 'varchar', length: 36 })
  shipmentId: string;

  @ManyToOne(() => Shipment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shipmentId' })
  shipment: Shipment;

  @Column({ type: 'varchar', length: 100, nullable: true })
  trackingNumber?: string | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'int', default: 0 })
  receivedQuantity: number;

  /** Ligne de stock créée / alimentée dans la branche de destination */
  @Column({ type: 'varchar', length: 36, nullable: true })
  destinationStockId?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
