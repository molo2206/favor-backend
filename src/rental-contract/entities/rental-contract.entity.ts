import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Product } from 'src/products/entities/product.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { RentalStatus } from '../enum/rentalStatus.enum';

@Entity('rental_contracts')
export class RentalContract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserEntity, (user) => user.rentalContracts, { eager: true, nullable: false })
  customer: UserEntity;

  @ManyToOne(() => Product, (product) => product.rentalContracts, {
    eager: true,
    nullable: false,
  })
  vehicle: Product;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  endDate: Date;

  @Column()
  totalDays: number;

  @Column('decimal', { precision: 10, scale: 2 })
  dailyRate: number;

  @Column('decimal', { precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ type: 'enum', enum: RentalStatus, default: RentalStatus.PENDING })
  status: RentalStatus;

  @Column({ type: 'int', default: 1 })
  quantity: number; // <-- Ajout du champ quantité

  @Column({ nullable: true })
  rentalNumber: string;

  @Column({ type: 'boolean', default: false })
  paid: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
