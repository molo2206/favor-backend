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
import { TransferStatus } from '../enums/parcel-checkin.enum';
import { ParcelTransferItem } from './parcel-transfer-item.entity';

/**
 * Transfert de colis d'une branche (dépôt) vers une autre.
 * À l'envoi, les colis sortent du stock de départ (OUT_TRANSFER) et sont « en transit » ;
 * ils n'entrent dans le stock de destination qu'à la clôture du pointage de réception (IN_TRANSFER).
 */
@Entity('parcel_transfers')
@Index('uq_pt_code', ['code'], { unique: true })
@Index('idx_pt_from_status', ['fromBranchId', 'status'])
@Index('idx_pt_to_status', ['toBranchId', 'status'])
export class ParcelTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Référence lisible : TR-AAMMJJ-XXXXX */
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'varchar', length: 36 })
  fromBranchId: string;

  @ManyToOne(() => BranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromBranchId' })
  fromBranch: BranchEntity;

  @Column({ type: 'varchar', length: 36 })
  toBranchId: string;

  @ManyToOne(() => BranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toBranchId' })
  toBranch: BranchEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId?: string | null;

  /** LTA d'origine des colis (facultatif) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_pt_lta')
  ltaId?: string | null;

  @ManyToOne(() => LtaEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ltaId' })
  lta?: LtaEntity | null;

  @Column({ type: 'enum', enum: TransferStatus, default: TransferStatus.IN_TRANSIT })
  status: TransferStatus;

  @Column({ type: 'int', default: 0 })
  parcelsCount: number;

  /** Pièces envoyées */
  @Column({ type: 'int', default: 0 })
  piecesCount: number;

  @Column({ type: 'int', default: 0 })
  receivedPieces: number;

  /** Pièces envoyées mais pas encore réceptionnées ni remises au départ */
  @Column({ type: 'int', default: 0 })
  missingPieces: number;

  @Column({ type: 'int', default: 0 })
  returnedPieces: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sentById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sentById' })
  sentBy?: UserEntity | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  sentAt?: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  receivedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receivedById' })
  receivedBy?: UserEntity | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  receivedAt?: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  cancelledById?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cancelReason?: string | null;

  @OneToMany(() => ParcelTransferItem, (i) => i.transfer)
  items: ParcelTransferItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
