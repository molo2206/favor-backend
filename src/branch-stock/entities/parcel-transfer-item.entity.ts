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
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { TransferItemStatus } from '../enums/parcel-checkin.enum';
import { ParcelTransfer } from './parcel-transfer.entity';

/** Un colis (et ses pièces) dans un transfert */
@Entity('parcel_transfer_items')
@Index('uq_pti_transfer_shipment', ['transferId', 'shipmentId'], { unique: true })
export class ParcelTransferItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  transferId: string;

  @ManyToOne(() => ParcelTransfer, (t) => t.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transferId' })
  transfer: ParcelTransfer;

  @Column({ type: 'varchar', length: 36 })
  @Index('idx_pti_shipment')
  shipmentId: string;

  @ManyToOne(() => Shipment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipmentId' })
  shipment: Shipment;

  /** Ligne de stock de la branche de départ */
  @Column({ type: 'varchar', length: 36 })
  fromStockId: string;

  /** Ligne de stock de la branche de destination (créée à la réception) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  toStockId?: string | null;

  @Column({ type: 'varchar', length: 100 })
  trackingNumber: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  clientName?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  clientPhone?: string | null;

  /** Pièces envoyées */
  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int', default: 0 })
  receivedQty: number;

  /** Pièces manquantes remises en stock à la branche de départ */
  @Column({ type: 'int', default: 0 })
  returnedQty: number;

  @Column({ type: 'enum', enum: TransferItemStatus, default: TransferItemStatus.IN_TRANSIT })
  status: TransferItemStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  outMovementId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  inMovementId?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
