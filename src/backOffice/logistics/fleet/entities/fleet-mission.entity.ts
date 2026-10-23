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
import { UserEntity } from 'src/users/entities/user.entity';
import { FleetMissionStatus, FleetMissionType } from '../../common/logistics.enums';
import { FleetVehicle } from './fleet-vehicle.entity';

/** Mission / sortie d'un véhicule */
@Entity('bo_fleet_missions')
@Index('idx_fleet_mission_vehicle', ['vehicleId', 'createdAt'])
@Index('idx_fleet_mission_company_status', ['companyId', 'status'])
export class FleetMission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  reference: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  vehicleId: string;

  @ManyToOne(() => FleetVehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicleId' })
  vehicle: FleetVehicle;

  @Column({ type: 'varchar', length: 36, nullable: true })
  driverId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driverId' })
  driver?: UserEntity | null;

  @Column({ type: 'enum', enum: FleetMissionType, default: FleetMissionType.OTHER })
  type: FleetMissionType;

  @Column({ type: 'varchar', length: 255 })
  purpose: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  origin?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  destination?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  plannedStartAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  plannedEndAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  endedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  startMileage?: number | null;

  @Column({ type: 'int', nullable: true })
  endMileage?: number | null;

  @Column({ type: 'int', nullable: true })
  distanceKm?: number | null;

  @Column({ type: 'enum', enum: FleetMissionStatus, default: FleetMissionStatus.PLANNED })
  status: FleetMissionStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
