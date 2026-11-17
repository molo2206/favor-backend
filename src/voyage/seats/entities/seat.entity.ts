
// seat.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Vehicle } from 'src/voyage/vehicles/entities/vehicle.entity'; // ← Ajout essentiel
import { ReservationSeat } from 'src/voyage/reservations-vehicles/entities/reservation-seat.entity';

@Entity('vehicle_seats')
export class VehicleSeat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  vehicle_id: string;

  @Column({ type: 'varchar', length: 20 })
  seat_number: string;

  @Column({ type: 'int', nullable: true })
  order: number;

  @Column({ type: 'enum', enum: ['STANDARD', 'PREMIUM', 'NEAR_DOOR', 'REAR'] })
  seat_type: string;

  @ManyToOne(() => Vehicle, (vehicle) => vehicle.seats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @OneToMany(() => ReservationSeat, (reservationSeat) => reservationSeat.seat)
  reservationSeats: ReservationSeat[];
}
