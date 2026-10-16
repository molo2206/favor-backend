// vehicle.entity.ts
import { CompanyEntity } from 'src/company/entities/company.entity';
import { VehicleSeat } from 'src/voyage/seats/entities/seat.entity';
import { Trip } from 'src/voyage/trips/entities/trip.entity';

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { VehicleSchedule } from './vehicle-schedule.entity';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  company_id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  license_plate: string;

  @Column({ type: 'enum', enum: ['BUS', 'TAXI', 'MINIBUS', 'CAR'] })
  vehicle_type: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  brand: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string;

  @Column({ type: 'json', nullable: true })
  images: any;

  @Column({ type: 'int' })
  total_seats: number;

  @Column({ type: 'float', nullable: true })
  max_baggage_weight_per_passenger: number;

  @Column({
    type: 'enum',
    enum: ['ACTIVE', 'MAINTENANCE', 'INACTIVE'],
    default: 'ACTIVE',
  })
  status: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @ManyToOne(() => CompanyEntity, (company) => company.vehicles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'company_id' })
  company: CompanyEntity;

  @OneToMany(() => VehicleSeat, (seat) => seat.vehicle)
  seats: VehicleSeat[];

  @OneToMany(() => VehicleSchedule, (schedule) => schedule.vehicle)
  schedules: VehicleSchedule[];

  @OneToMany(() => Trip, (trip) => trip.vehicle)
  trips: Trip[];
}
