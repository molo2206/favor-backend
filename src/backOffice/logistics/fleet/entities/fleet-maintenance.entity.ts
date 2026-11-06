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
import { decimalNumber } from '../../common/decimal.transformer';
import { FleetMaintenanceStatus, FleetMaintenanceType } from '../../common/logistics.enums';
import { FleetVehicle } from './fleet-vehicle.entity';

/** Entretien, réparation ou panne */
@Entity('bo_fleet_maintenances')
@Index('idx_fleet_maint_vehicle', ['vehicleId', 'createdAt'])
@Index('idx_fleet_maint_company_status', ['companyId', 'status'])
export class FleetMaintenance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  vehicleId: string;

  @ManyToOne(() => FleetVehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicleId' })
  vehicle: FleetVehicle;

  @Column({ type: 'enum', enum: FleetMaintenanceType, default: FleetMaintenanceType.PREVENTIVE })
  type: FleetMaintenanceType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  garage?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  scheduledAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  mileage?: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: decimalNumber })
  cost?: number | null;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: FleetMaintenanceStatus, default: FleetMaintenanceStatus.SCHEDULED })
  status: FleetMaintenanceStatus;

  /** Prochain entretien prévu (date et/ou kilométrage) */
  @Column({ type: 'date', nullable: true })
  nextDueDate?: string | null;

  @Column({ type: 'int', nullable: true })
  nextDueMileage?: number | null;

  /** ✅ AJOUT : image (facture du garage, photo de la panne…) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
