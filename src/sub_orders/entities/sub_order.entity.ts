
import { OrderEntity } from "src/order/entities/order.entity";
import { SubOrderItemEntity } from "src/sub_order_items/entities/sub_order_item.entity";
import { UserEntity } from "src/users/entities/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('sub_orders')
export class SubOrderEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    orderId: string;

    @ManyToOne(() => OrderEntity, (order) => order.subOrders, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'orderId' })
    order: OrderEntity;

    // @Column()
    // companyId: string;

    // @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
    // @JoinColumn({ name: 'companyId' })
    // company: CompanyEntity;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    subtotal: number;

    @Column({ default: 'pending' })
    status: 'pending' | 'confirmed' | 'in_progress' | 'completed';

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => SubOrderItemEntity, (item) => item.subOrder)
    items: SubOrderItemEntity[];

    @ManyToOne(() => UserEntity)
    @JoinColumn({ name: 'user_id' })
    createdBy: UserEntity;

    @OneToMany(() => SubOrderItemEntity, (item) => item.subOrder, { cascade: true })
    subOrderItems: SubOrderItemEntity[];
}


