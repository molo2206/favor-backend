// reservation-seat.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ReservationVehicule } from './reservations-vehicle.entity';
import { VehicleSeat } from 'src/voyage/seats/entities/seat.entity';

@Entity('reservation_seats')
export class ReservationSeat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  reservation_id: string;

  @Column({ type: 'varchar', length: 36 })
  seat_id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  assigned_at: Date;

  @ManyToOne(
    () => ReservationVehicule,
    (reservation) => reservation.reservationSeats,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'reservation_id' })
  reservation: ReservationVehicule

  @ManyToOne(() => VehicleSeat, (seat) => seat.reservationSeats, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'seat_id' })
  seat: VehicleSeat;
}
