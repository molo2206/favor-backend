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
import { UserEntity } from 'src/users/entities/user.entity';
import { InternalTransferStatus } from '../../common/logistics.enums';
import { FleetVehicle } from '../../fleet/entities/fleet-vehicle.entity';
import { FleetMission } from '../../fleet/entities/fleet-mission.entity';
import { InternalTransferItem } from './internal-transfer-item.entity';

/** Transfert interne de colis d'une branche vers une autre */
@Entity('bo_logistics_transfers')
@Index('idx_bo_transfer_company_status', ['companyId', 'status'])
@Index('idx_bo_transfer_from', ['fromBranchId', 'createdAt'])
@Index('idx_bo_transfer_to', ['toBranchId', 'createdAt'])
export class InternalTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  reference: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  fromBranchId: string;

  @ManyToOne(() => BranchEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fromBranchId' })
  fromBranch: BranchEntity;

  @Column({ type: 'varchar', length: 36 })
  toBranchId: string;

  @ManyToOne(() => BranchEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'toBranchId' })
  toBranch: BranchEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  vehicleId?: string | null;

  @ManyToOne(() => FleetVehicle, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vehicleId' })
  vehicle?: FleetVehicle | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  driverId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driverId' })
  driver?: UserEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  missionId?: string | null;

  @ManyToOne(() => FleetMission, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'missionId' })
  mission?: FleetMission | null;

  @Column({ type: 'enum', enum: InternalTransferStatus, default: InternalTransferStatus.DRAFT })
  status: InternalTransferStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  plannedDepartureAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  dispatchedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  receivedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  dispatchedById?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  receivedById?: string | null;

  @OneToMany(() => InternalTransferItem, (i) => i.transfer, { cascade: ['insert'] })
  items: InternalTransferItem[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
