import { OrderEntity } from 'src/order/entities/order.entity';
import { PaymentStatus } from 'src/users/utility/common/payment.status.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

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

  @Column()
  transactionReference: string; // Référence unique de la transaction (par exemple, un ID généré par un fournisseur de paiement)

  @Column({ type: 'varchar', length: 255, nullable: true })
  paymentMethod: string; // Exemple : "Carte de crédit", "PayPal", etc.

  @Column({ type: 'varchar', length: 255, nullable: true })
  paymentGateway: string; // Exemple : "Stripe", "PayPal", etc.

  @Column({ type: 'varchar', length: 3, nullable: false })
  currency: string; // Devise de la transaction, par exemple 'USD', 'EUR', etc.

  @CreateDateColumn()
  createdAt: Date;

  @CreateDateColumn()
  updatedAt: Date;
}
