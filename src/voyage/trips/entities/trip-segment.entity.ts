// trip-segment.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Trip } from './trip.entity';
import { ScheduleStatus } from 'src/voyage/vehicles/enum/schedule-status.enum';
import { ReservationSegment } from 'src/voyage/reservations-vehicles/entities/reservation-segment.entity';
import { VehicleSchedule } from 'src/voyage/vehicles/entities/vehicle-schedule.entity';
import { Vehicle } from 'src/voyage/vehicles/entities/vehicle.entity';

@Entity('trip_segments')
export class TripSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  trip_id: string;

  @Column({ type: 'int' })
  segment_order: number; // Ordre: 1, 2, 3...

  @Column({ type: 'varchar', length: 36, nullable: true })
  schedule_id: string;

  @Column({ type: 'varchar', length: 36 })
  vehicle_id: string;

  @Column({ type: 'varchar', length: 100 })
  departure_city: string;

  @Column({ type: 'varchar', length: 100 })
  arrival_city: string;

  @Column({ type: 'datetime' })
  departure_datetime: Date;

  @Column({ type: 'datetime' })
  estimated_arrival_datetime: Date;

  @Column({ type: 'datetime', nullable: true })
  actual_departure_datetime: Date;

  @Column({ type: 'datetime', nullable: true })
  actual_arrival_datetime: Date;

  @Column({ type: 'int', nullable: true })
  distance_km: number;

  @Column({ type: 'int', nullable: true })
  estimated_duration_minutes: number;

  @Column({
    type: 'enum',
    enum: ScheduleStatus,
    default: ScheduleStatus.SCHEDULED,
  })
  status: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  segment_price: number; // Prix pour ce segment

  // Relations
  @ManyToOne(() => Trip, (trip) => trip.segments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @ManyToOne(() => VehicleSchedule, { nullable: true })
  @JoinColumn({ name: 'schedule_id' })
  schedule: VehicleSchedule;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @OneToMany(() => ReservationSegment, (rs) => rs.segment)
  reservationSegments: ReservationSegment[];
}