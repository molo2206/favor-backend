// vehicle-schedule.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Vehicle } from 'src/voyage/vehicles/entities/vehicle.entity'; // adapter chemin
import { CompanyEntity } from 'src/company/entities/company.entity';
import { Trip } from 'src/voyage/trips/entities/trip.entity';
import { ScheduleStatus } from '../enum/schedule-status.enum';
import { Recurrence } from '../enum/recurrence.enum';

@Entity('vehicle_schedules')
export class VehicleSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  company_id: string;

  @Column({ type: 'varchar', length: 36 })
  vehicle_id: string;

  @Column({ type: 'varchar', length: 191 })
  driver_name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  driver_phone: string;

  @Column({ type: 'varchar', length: 100 })
  departure_city: string;

  @Column({ type: 'varchar', length: 100 })
  arrival_city: string;

  @Column({ type: 'datetime' })
  departure_datetime: Date;

  @Column({ type: 'datetime' })
  estimated_arrival_datetime: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  base_price: number;

  @Column({
    type: 'enum',
    enum: ScheduleStatus,
    default: ScheduleStatus.SCHEDULED,
  })
  status: ScheduleStatus;

  @Column({
    type: 'enum',
    enum: Recurrence,
    default: Recurrence.ONE_TIME,
  })
  recurrence: string;

  @Column({ type: 'date', nullable: true })
  recurrence_end_date: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @ManyToOne(() => CompanyEntity, (company) => company.schedules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'company_id' })
  company: CompanyEntity;

  @ManyToOne(() => Vehicle, (vehicle) => vehicle.schedules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @OneToMany(() => Trip, (trip) => trip.schedule)
  trips: Trip[];
}
