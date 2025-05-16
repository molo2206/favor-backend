import { OrderEntity } from 'src/order/entities/order.entity';
import { PaymentStatus } from 'src/transaction/enum/payment.status.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TransactionType } from '../transaction.enum';

@Entity('transactions')
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => OrderEntity, (order) => order.id)
  order: OrderEntity;

  @Column()
  orderId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column()
  transactionReference: string; // Référence unique de la transaction (par exemple, un ID généré par un fournisseur de paiement)

  @Column({ type: 'varchar', length: 3, nullable: false })
  currency: string; // Devise de la transaction, par exemple 'USD', 'EUR', etc.

  @CreateDateColumn()
  createdAt: Date;

  @CreateDateColumn()
  updatedAt: Date;
}
