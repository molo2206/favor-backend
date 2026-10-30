import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { decimalNumber } from '../../common/decimal.transformer';
import { FleetVehicle } from './fleet-vehicle.entity';

/** Plein de carburant */
@Entity('bo_fleet_fuel_logs')
@Index('idx_fleet_fuel_vehicle_date', ['vehicleId', 'filledAt'])
export class FleetFuelLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ type: 'varchar', length: 36, nullable: true })
  missionId?: string | null;

  @Column({ type: 'datetime', precision: 6 })
  filledAt: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalNumber })
  liters: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalNumber })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalNumber })
  totalCost: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'int', nullable: true })
  mileage?: number | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  station?: string | null;

  @Column({ default: true })
  fullTank: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  receiptUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
