import { OrderEntity } from 'src/order/entities/order.entity';
import { Product } from 'src/products/entities/product.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('order_items')
export class OrderItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => OrderEntity, (order) => order.orderItems)
  order: OrderEntity;

  @Column()
  orderId: string;

  @ManyToOne(() => Product)
  product: Product;

  @Column()
  productId: string;

  @Column()
  quantity: number;

  @Column({ type: 'float', nullable: false })
  price: number;
}
