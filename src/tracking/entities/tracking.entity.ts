import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
    JoinColumn,
} from 'typeorm';
import { DeliveryEntity } from 'src/delivery/entities/delivery.entity';

@Entity('tracking')
export class TrackingEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    status: string;

    @Column({ nullable: true })
    location: string; 

    @Column({ nullable: true })
    notes?: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @ManyToOne(() => DeliveryEntity, (delivery) => delivery.trackings, {
        onDelete: 'CASCADE',
        nullable: true,
    })
    @JoinColumn({ name: 'delivery_id' })
    delivery: DeliveryEntity;
}
