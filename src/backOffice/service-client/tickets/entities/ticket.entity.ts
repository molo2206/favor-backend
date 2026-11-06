import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { OrderEntity } from 'src/order/entities/order.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { TicketPriority } from '../../common/enums/ticket-priority.enum';
import { TicketCategory } from '../../common/enums/ticket-category.enum';

@Entity('tickets')
export class TicketEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index('idx_tickets_number', { unique: true })
    @Column({ unique: true })
    ticketNumber: string;

    @Column()
    subject: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.NEW })
    status: TicketStatus;

    @Column({ type: 'enum', enum: TicketPriority, default: TicketPriority.NORMAL })
    priority: TicketPriority;

    @Column({ type: 'enum', enum: TicketCategory, default: TicketCategory.OTHER })
    category: TicketCategory;

    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'customerId' })
    customer?: UserEntity;

    @Index('idx_tickets_customer')
    @Column({ nullable: true })
    customerId?: string;

    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'assignedToId' })
    assignedTo?: UserEntity;

    @Index('idx_tickets_assigned_to')
    @Column({ nullable: true })
    assignedToId?: string;

    @ManyToOne(() => OrderEntity, { nullable: true })
    @JoinColumn({ name: 'orderId' })
    order?: OrderEntity;

    @Column({ nullable: true })
    orderId?: string;

    @ManyToOne(() => Shipment, { nullable: true })
    @JoinColumn({ name: 'shipmentId' })
    shipment?: Shipment;

    @Column({ nullable: true })
    shipmentId?: string;

    @Column({ type: 'timestamp', nullable: true })
    firstResponseAt?: Date;

    @Column({ type: 'timestamp', nullable: true })
    resolvedAt?: Date;

    @Column({ type: 'timestamp', nullable: true })
    closedAt?: Date;

    @Column({ type: 'timestamp', nullable: true })
    slaDeadline?: Date;

    @Column({ default: false })
    slaBreached: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}