// trip.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Vehicle } from 'src/voyage/vehicles/entities/vehicle.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { VehicleSchedule } from 'src/voyage/vehicles/entities/vehicle-schedule.entity';
import { ReservationVehicule } from 'src/voyage/reservations-vehicles/entities/reservations-vehicle.entity';
import { ScheduleStatus } from 'src/voyage/vehicles/enum/schedule-status.enum';
import { TripSegment } from './trip-segment.entity';

@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

@Column({ type: 'varchar', length: 36, nullable: true }) // ✅ nullable: true
  schedule_id: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true }) // ✅ nullable: true
  vehicle_id: string | null;

  @Column({ type: 'varchar', length: 36 })
  company_id: string;

  @Column({ type: 'datetime' })
  departure_datetime: Date;

  @Column({ type: 'datetime', nullable: true })
  actual_departure_datetime: Date;

  @Column({ type: 'datetime', nullable: true })
  actual_arrival_datetime: Date;

  @Column({
    type: 'enum',
    enum: ScheduleStatus,
    default: ScheduleStatus.SCHEDULED,
  })
  status: string;

  @ManyToOne(() => VehicleSchedule, (schedule) => schedule.trips, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'schedule_id' })
  schedule: VehicleSchedule;

  @ManyToOne(() => Vehicle, (vehicle) => vehicle.trips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @ManyToOne(() => CompanyEntity, (company) => company.trips, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'company_id' })
  company: CompanyEntity;

  @OneToMany(() => ReservationVehicule, (reservation) => reservation.trip)
  reservations: ReservationVehicule[];

  @OneToMany(() => TripSegment, (segment) => segment.trip)
  segments: TripSegment[];
  
}
