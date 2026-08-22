// baggage.entity.ts
import { ReservationVehicule } from 'src/voyage/reservations-vehicles/entities/reservations-vehicle.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaggageType } from '../enum/baggage-type.enum';

@Entity('baggage')
export class Baggage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true }) // ✅ facultatif
  reservation_id: string;

  @Column({
    type: 'enum',
    enum: BaggageType,
    default: BaggageType.SPECIAL,
  })
  baggage_type: string;

  @Column({ type: 'float', nullable: true })
  weight: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  dimensions: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  extra_fee: number;

  @ManyToOne(
    () => ReservationVehicule,
    (reservation) => reservation.baggageList,
    { onDelete: 'CASCADE', nullable: true }, // ✅ relation facultative
  )
  @JoinColumn({ name: 'reservation_id' })
  reservation: ReservationVehicule;
}