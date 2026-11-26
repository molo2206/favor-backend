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
import { UserEntity } from 'src/users/entities/user.entity';
import { CheckinItemStatus } from '../enums/parcel-checkin.enum';
import { ParcelCheckin } from './parcel-checkin.entity';

/** Un colis dans une séance de pointage (attendu, non prévu ou code inconnu) */
@Entity('parcel_checkin_items')
@Index('uq_pci_checkin_tracking', ['checkinId', 'trackingNumber'], { unique: true })
@Index('idx_pci_checkin_status', ['checkinId', 'status'])
export class ParcelCheckinItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  checkinId: string;

  @ManyToOne(() => ParcelCheckin, (c) => c.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'checkinId' })
  checkin: ParcelCheckin;

  /** Vide pour un code inconnu */
  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_pci_shipment')
  shipmentId?: string | null;

  @ManyToOne(() => Shipment, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipmentId' })
  shipment?: Shipment | null;

  /** Numéro de suivi (ou code scanné si inconnu), en MAJUSCULES */
  @Column({ type: 'varchar', length: 100 })
  trackingNumber: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  clientName?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  clientPhone?: string | null;

  /** Pièces attendues (0 = non prévu / inconnu / déjà réceptionné) */
  @Column({ type: 'int', default: 0 })
  expectedQty: number;

  @Column({ type: 'int', default: 0 })
  checkedQty: number;

  @Column({ type: 'enum', enum: CheckinItemStatus, default: CheckinItemStatus.PENDING })
  status: CheckinItemStatus;

  /** Colis abîmé / ouvert constaté au pointage */
  @Column({ type: 'boolean', default: false })
  damaged: boolean;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** Ligne de transfert (réception d'un transfert) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  transferItemId?: string | null;

  /** Résultat de la clôture */
  @Column({ type: 'varchar', length: 36, nullable: true })
  stockId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  movementId?: string | null;

  /** Erreur ou remarque à la clôture (ex : colis non réceptionné) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  closeResult?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  firstCheckedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastCheckedAt?: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  checkedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'checkedById' })
  checkedBy?: UserEntity | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
