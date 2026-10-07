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
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { DeliveryEntity } from 'src/delivery/entities/delivery.entity';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';
import { OrderDeliveryAssignment } from './order-delivery-assignment.entity';

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

  // ✅ Index composite (userId, createdAt) + index FK
  @Index('idx_orders_user_created')
  @Index('FK_151b79a83ba240b0cb31b2302d1')
  @Column()
  userId: string;

  @Index('FK_892400869a4ee28c3de392aa998')
  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'validated_by' })
  validatedBy?: UserEntity;

  @Column({ type: 'timestamp', nullable: true })
  validatedAt?: Date;

  @Index('FK_3bf5b887026b8690e198a21819d')
  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'processing_by' })
  processingBy?: UserEntity;

  @Column({ type: 'timestamp', nullable: true })
  processingAt?: Date;

  @Index('FK_b593223b1c66d5ec6a83270cc0a')
  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'completed_by' })
  completedBy?: UserEntity;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Index('FK_12aa4abe017627d1b865627dc93')
  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'delivered_by' })
  deliveredBy?: UserEntity;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  @Index('FK_214e0758fac4eac0ede86a88a74')
  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'rejected_by' })
  rejectedBy?: UserEntity;

  @Column({ type: 'timestamp', nullable: true })
  rejectedAt?: Date;

  @ManyToOne(() => AddressUser, { nullable: false })
  @JoinColumn({ name: 'addressUserId' })
  addressUser: AddressUser;

  @Index('FK_0e3c902c497fbf1cc7575846914')
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

  // ✅ Index composite (userId, createdAt) + index sur createdAt
  @Index('idx_orders_user_created')
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    nullable: true,
    default: PaymentMethod.CASH,
  })
  paymentMethod?: PaymentMethod;

  @Column({ type: 'float', nullable: true, default: 0 })
  appliedFeeRate?: number;

  @Column({ type: 'float', nullable: true, default: 0 })
  transactionFee?: number;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date;

  @Column({ type: 'text', nullable: true })
  cancellationReason?: string;

  @Column({ type: 'boolean', default: false })
  readyToPay: boolean;

  @OneToMany(
    () => OrderDeliveryAssignment,
    (assignment) => assignment.order,
    { cascade: true },
  )
  deliveryAssignments: OrderDeliveryAssignment[];

  /** 🚚 Livreur actuellement affecté (dénormalisation) */
  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'currentDeliveryUserId' })
  currentDeliveryUser?: UserEntity;

  @Index('FK_orders_currentDeliveryUser')
  @Column({ nullable: true })
  currentDeliveryUserId?: string;
}