import { Product } from "src/products/entities/product.entity";
import { SubOrderEntity } from "src/sub_orders/entities/sub_order.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('sub_order_items')
export class SubOrderItemEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    subOrderId: string;

    @ManyToOne(() => SubOrderEntity, (subOrder) => subOrder.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'subOrderId' })
    subOrder: SubOrderEntity;

    @Column()
    productId: string;

    @ManyToOne(() => Product, { eager: true })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column()
    quantity: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    unitPrice: number;
}
