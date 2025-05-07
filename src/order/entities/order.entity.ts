import { OrderItemEntity } from "src/order_items/entities/order_item.entity";
import { Product } from "src/products/entities/product.entity";
import { SubOrderEntity } from "src/sub_orders/entities/sub_order.entity";
import { UserEntity } from "src/users/entities/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { OrderStatus } from "../enum/orderstatus.enum";

@Entity('orders')
export class OrderEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => UserEntity, (user) => user.orders)
    user: UserEntity;

    @Column()
    userId: string;

    @OneToMany(() => SubOrderEntity, (subOrder) => subOrder.order)
    subOrders: SubOrderEntity[];

    @Column({ type: 'enum', enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] })
    status: OrderStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => OrderItemEntity, (item) => item.order, { cascade: true })
    orderItems: OrderItemEntity[];

    @ManyToOne(() => Product)
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({ nullable: true })
    address: string;

    @Column({ nullable: true })
    latitude: string;

    @Column({ nullable: true })
    longitude: string;
}
