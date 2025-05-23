import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { OrderEntity } from 'src/order/entities/order.entity';
import { SubOrderItemEntity } from 'src/sub-order-item/entities/sub-order-item.entity';

@Entity('sub_orders')
export class SubOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => OrderEntity, (order) => order.subOrders, { onDelete: 'CASCADE' })
  order: OrderEntity;

  @ManyToOne(() => CompanyEntity, { eager: true })
  company: CompanyEntity;

  @OneToMany(() => SubOrderItemEntity, (item) => item.subOrder, { cascade: true })
  items: SubOrderItemEntity[];

  @Column({ type: 'float', default: 0 })
  totalAmount: number;

  @Column({ nullable: true })
  invoiceNumber: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
