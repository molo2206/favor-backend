// src/operation/entities/operation.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { OrderEntity } from 'src/order/entities/order.entity';
import { OperationStatus } from '../enum/operation.status.enum';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { PaymentMethod } from '../enum/payment-method.enum';
import { ReservationVehicule } from 'src/voyage/reservations-vehicles/entities/reservations-vehicle.entity';
import { Reservation } from 'src/HotelRoomAvailability/entity/Reservation.entity';

@Entity('operations')
export class OperationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Montant débité */
  @Column({ type: 'float', default: 0 })
  debit: number;

  /** Montant crédité */
  @Column({ type: 'float', default: 0 })
  credit: number;

  /** Description lisible */
  @Column()
  designation: string;

  @Column({
    type: 'enum',
    enum: OperationStatus,
    default: OperationStatus.PENDING,
  })
  status: OperationStatus;

  @Column({
    type: 'varchar', // Changez de 'uuid' à 'varchar' pour correspondre à votre table SQL
    length: 36,
    nullable: true,
  })
  orderId?: string;

  @ManyToOne(() => OrderEntity, {
    nullable: true,
    createForeignKeyConstraints: false, // IMPORTANT: Désactive la création automatique
  })
  @JoinColumn({
    name: 'orderId',
    referencedColumnName: 'id',
  })
  @Index() // Ajoute un index
  order?: OrderEntity;

  @Column({
    type: 'varchar', // Changez de 'uuid' à 'varchar' pour correspondre à votre table SQL
    length: 36,
    nullable: true,
  })
  shipmentId?: string;

  @ManyToOne(() => Shipment, {
    nullable: true,
    createForeignKeyConstraints: false, // IMPORTANT: Désactive la création automatique
  })
  @JoinColumn({
    name: 'shipmentId',
    referencedColumnName: 'id',
  })
  @Index() // Ajoute un index
  shipment?: Shipment;

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  reservationId?: string;

  @ManyToOne(() => ReservationVehicule, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'reservationId', referencedColumnName: 'id' })
  @Index()
  reservation?: ReservationVehicule;

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  hotelReservationId?: string;

  @ManyToOne(() => Reservation, {
    nullable: true,
    createForeignKeyConstraints: false, // désactive la contrainte automatique si la table est dans un autre module
  })
  @JoinColumn({ name: 'hotelReservationId', referencedColumnName: 'id' })
  @Index()
  hotelReservation?: Reservation;

  @ManyToOne(() => UserEntity, (user) => user.orders)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    nullable: true,
  })
  paymentMethod?: PaymentMethod;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  provider?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  reference?: string;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 36,
    comment: 'ID de la transaction FPAY'
  })
  fpayTransactionId: string;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 255,
    comment: 'Référence de la transaction FPAY'
  })
  fpayReference: string;
}
