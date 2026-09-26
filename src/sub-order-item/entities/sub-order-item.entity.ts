import { Product } from 'src/products/entities/product.entity';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('sub_order_items')
export class SubOrderItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SubOrderEntity, (subOrder) => subOrder.items)
  subOrder: SubOrderEntity;

  @Column()
  subOrderId: string;

  @ManyToOne(() => Product)
  product: Product;

  @Column()
  productId: string;

  @Column()
  quantity: number;

  @Column({ type: 'float', nullable: false })
  price: number;
}
