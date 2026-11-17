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
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CheckinStatus, CheckinType } from '../enums/parcel-checkin.enum';
import { ParcelCheckinItem } from './parcel-checkin-item.entity';
import { ParcelTransfer } from './parcel-transfer.entity';

/**
 * Séance de pointage dans une branche :
 *  - LTA_ARRIVAL : arrivée d'une LTA (n'importe quel dépôt) ;
 *  - TRANSFER_RECEPTION : réception d'un transfert venant d'une autre branche.
 * Les scans n'ont aucun effet sur le stock tant que la séance n'est pas clôturée.
 */
@Entity('parcel_checkins')
@Index('uq_pc_code', ['code'], { unique: true })
@Index('idx_pc_branch_status', ['branchId', 'status'])
export class ParcelCheckin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Référence lisible : PT-AAMMJJ-XXXXX */
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'enum', enum: CheckinType })
  type: CheckinType;

  @Column({ type: 'enum', enum: CheckinStatus, default: CheckinStatus.OPEN })
  status: CheckinStatus;

  /** Branche où se fait le pointage */
  @Column({ type: 'varchar', length: 36 })
  branchId: string;

  @ManyToOne(() => BranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch: BranchEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_pc_lta')
  ltaId?: string | null;

  @ManyToOne(() => LtaEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ltaId' })
  lta?: LtaEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_pc_transfer')
  transferId?: string | null;

  @ManyToOne(() => ParcelTransfer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transferId' })
  transfer?: ParcelTransfer | null;

  /** Statut à donner aux colis à la clôture (ex : ARRIVED_DESTINATION). Vide = inchangé */
  @Column({ type: 'varchar', length: 40, nullable: true })
  shipmentStatus?: string | null;

  @Column({ type: 'int', default: 0 })
  expectedParcels: number;

  @Column({ type: 'int', default: 0 })
  expectedPieces: number;

  @Column({ type: 'int', default: 0 })
  checkedParcels: number;

  @Column({ type: 'int', default: 0 })
  checkedPieces: number;

  @Column({ type: 'int', default: 0 })
  missingParcels: number;

  @Column({ type: 'int', default: 0 })
  missingPieces: number;

  @Column({ type: 'int', default: 0 })
  unexpectedParcels: number;

  @Column({ type: 'int', default: 0 })
  unknownCodes: number;

  @Column({ type: 'int', default: 0 })
  damagedParcels: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  openedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'openedById' })
  openedBy?: UserEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  closedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'closedById' })
  closedBy?: UserEntity | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  closedAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cancelReason?: string | null;

  @OneToMany(() => ParcelCheckinItem, (i) => i.checkin)
  items: ParcelCheckinItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
