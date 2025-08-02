import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { Product } from 'src/products/entities/product.entity';
import { PaymentStatus } from '../enum/paymentStatus.enum';

@Entity()
export class SaleTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserEntity, (user) => user.saleTransactions)
  @JoinColumn({ name: 'customerId' })
  customer: UserEntity;

  @Column()
  customerId: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'vehicleId' })
  vehicle: Product;

  @Column()
  vehicleId: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Column()
  salePrice: number;

  @Column()
  date: Date;
}
