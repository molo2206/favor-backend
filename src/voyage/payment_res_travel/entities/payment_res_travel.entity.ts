// payment.entity.ts
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';
import { ReservationVehicule } from 'src/voyage/reservations-vehicles/entities/reservations-vehicle.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PaymentStatus } from '../enum/payment-status.enum';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  reservation_id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.MANUAL })
  payment_method: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: string;

  @Column({ type: 'varchar', length: 191, nullable: true })
  transaction_ref: string;

  @Column({ type: 'datetime', nullable: true })
  paid_at: Date;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @ManyToOne(() => ReservationVehicule, (reservation) => reservation.payments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'reservation_id' })
  reservation: ReservationVehicule;
}
