// reservation-segment.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ReservationVehicule } from './reservations-vehicle.entity';
import { TripSegment } from 'src/voyage/trips/entities/trip-segment.entity';
import { VehicleSeat } from 'src/voyage/seats/entities/seat.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Entity('reservation_segments')
export class ReservationSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  reservation_id: string;

  @Column({ type: 'varchar', length: 36 })
  segment_id: string;

  @Column({ type: 'varchar', length: 36 })
  seat_id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  assigned_at: Date;

  //  Champ pour savoir si le billet a été scanné
  @Column({ type: 'boolean', default: false })
  isScanned: boolean;

  //  Date et heure du scan
  @Column({ type: 'datetime', nullable: true })
  scanned_at: Date;

  @Column({ type: 'varchar', length: 36, nullable: true })
  scanned_by: string;

  @ManyToOne(() => ReservationVehicule, (reservation) => reservation.segmentReservations)
  @JoinColumn({ name: 'reservation_id' })
  reservation: ReservationVehicule;

  @ManyToOne(() => TripSegment, (segment) => segment.reservationSegments)
  @JoinColumn({ name: 'segment_id' })
  segment: TripSegment;

  @ManyToOne(() => VehicleSeat)
  @JoinColumn({ name: 'seat_id' })
  seat: VehicleSeat;

  @Column({ type: 'varchar', length: 100, nullable: true })
  passenger_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  passenger_prename: string;

  // ✅ Relation avec l'utilisateur qui a scanné (agent / personnel)
  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'scanned_by' })
  scanner: UserEntity;
}