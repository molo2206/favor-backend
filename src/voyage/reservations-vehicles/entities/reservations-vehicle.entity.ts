// reservation-vehicule.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { ReservationSeat } from './reservation-seat.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { Trip } from 'src/voyage/trips/entities/trip.entity';
import { Baggage } from 'src/voyage/baggage/entities/baggage.entity';
import { Payment } from 'src/voyage/payment_res_travel/entities/payment_res_travel.entity';
import { ReservationStatus } from '../enum/reservation-status.enum';
import { ReservationSegment } from './reservation-segment.entity';
import { ReservationMeal } from 'src/voyage/meal/entity/reservation-meal.entity';

@Entity('reservations_vehicules')
export class ReservationVehicule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  user_id: string;

  @Column({ type: 'varchar', length: 36 })
  trip_id: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  reservation_date: Date;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_amount: number;

  @Column({ type: 'datetime', nullable: true })
  expires_at: Date;

  @ManyToOne(() => UserEntity, (user) => user.reservations, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => Trip, (trip) => trip.reservations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @OneToMany(
    () => ReservationSeat,
    (reservationSeat) => reservationSeat.reservation,
  )
  reservationSeats: ReservationSeat[];

  @OneToMany(() => Baggage, (baggage) => baggage.reservation)
  baggageList: Baggage[];

  @OneToMany(() => Payment, (payment) => payment.reservation)
  payments: Payment[];

  @OneToMany(() => ReservationSegment, (rs) => rs.reservation)
  segmentReservations: ReservationSegment[];

  @OneToMany(() => ReservationMeal, (rm) => rm.reservation)
  meals: ReservationMeal[];
}
