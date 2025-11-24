import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Product } from 'src/products/entities/product.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ReservationStatus } from '../enum/reservation-room.enum';

@Entity('reservations')
@Index(['product', 'startDate', 'endDate'])
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relation avec User - TypeORM créera automatiquement la colonne 'userId'
  @ManyToOne(() => UserEntity, (user) => user.reservations, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' }) // Optionnel - pour spécifier le nom de la colonne
  user: UserEntity;

  // Relation avec Product - TypeORM créera automatiquement la colonne 'productId'
  @ManyToOne(() => Product, (product) => product.reservations, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' }) // Optionnel - pour spécifier le nom de la colonne
  product: Product;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'int' })
  adults: number;

  @Column({ type: 'int' })
  children: number;

  @Column({ type: 'int' })
  roomsBooked: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  @Column({ type: 'text', nullable: true })
  specialRequest?: string;

  @CreateDateColumn({ nullable: true })
  createdAt: Date | null;

  @UpdateDateColumn({ nullable: true })
  updatedAt: Date | null;
}