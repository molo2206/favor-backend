import { AddressUser } from "src/address-user/entities/address-user.entity";
import { OrderItemEntity } from "src/order-item/entities/order-item.entity";
import { SubOrderEntity } from "src/sub-order/entities/sub-order.entity";
import { UserEntity } from "src/users/entities/user.entity";
import { CompanyType } from "src/users/utility/common/type.company.enum";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('orders')
export class OrderEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('decimal')
    totalAmount: number;

    @Column('decimal')
    shippingCost: number;

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

    @OneToMany(() => SubOrderEntity, (subOrder) => subOrder.order, { cascade: true })
    subOrders: SubOrderEntity[];

    @Column({ type: 'float', nullable: false })
    grandTotal: number;


    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}