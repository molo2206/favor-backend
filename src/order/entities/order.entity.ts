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

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'validated_by' })
  validatedBy?: UserEntity;

  @Column({ type: 'timestamp', nullable: true })
  validatedAt?: Date;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'processing_by' })
  processingBy?: UserEntity;

  @Column({ type: 'timestamp', nullable: true })
  processingAt?: Date;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'completed_by' })
  completedBy?: UserEntity;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'delivered_by' })
  deliveredBy?: UserEntity;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'rejected_by' })
  rejectedBy?: UserEntity;

  @Column({ type: 'timestamp', nullable: true })
  rejectedAt?: Date;

  @ManyToOne(() => AddressUser, { nullable: false })
  @JoinColumn({ name: 'addressUserId' }) 
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
  paid: boolean; 

  @Column({ nullable: true, length: 6 })
  pin: string;

  @OneToOne(() => DeliveryEntity, (delivery) => delivery.order)
  delivery: DeliveryEntity;

  @Column({ type: 'enum', enum: CompanyActivity })
  shopType: CompanyActivity;

  @Column({ nullable: true })
  whatsapp_number: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
