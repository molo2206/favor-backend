import { AddressUser } from 'src/address-user/entities/address-user.entity';
import { OrderItemEntity } from 'src/order-item/entities/order-item.entity';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { OrderStatus } from 'src/order/enum/order.status.enum';
import { PaymentStatus } from 'src/transaction/enum/payment.status.enum';
import { CompanyType } from 'src/company/enum/type.company.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { DeliveryEntity } from 'src/delivery/entities/delivery.entity';

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 10, scale: 2 })
  totalAmount: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true, default: 0 })
  shippingCost?: number;

  @Column({ type: 'enum', enum: CompanyType })
  type: CompanyType;

  @Column()
  currency: string;

  @ManyToOne(() => UserEntity, (user) => user.orders)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column()
  userId: string;

  @ManyToOne(() => AddressUser, { nullable: false }) // changé de true → false
  @JoinColumn({ name: 'addressUserId' }) // Ajout explicite de la colonne FK
  addressUser: AddressUser;

  @Column()
  addressUserId: string;

  @OneToMany(() => OrderItemEntity, (item) => item.order, { cascade: true })
  orderItems: OrderItemEntity[];

  @OneToMany(() => SubOrderEntity, (subOrder) => subOrder.order, {
    cascade: true,
  })
  subOrders: SubOrderEntity[];

  @Column({ nullable: true })
  invoiceNumber: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  @Column({ type: 'float', nullable: false })
  grandTotal: number;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ type: 'boolean', default: false })
  paid: boolean; // Correct type: boolean

  @Column({ nullable: true, length: 6 })
  pin: string;

  @OneToOne(() => DeliveryEntity, (delivery) => delivery.order)
  delivery: DeliveryEntity;

  @Column({ type: 'enum', enum: CompanyActivity }) // Ajout du champ
  shopType: CompanyActivity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
