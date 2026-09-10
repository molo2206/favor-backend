import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { OrderEntity } from 'src/order/entities/order.entity';
import { DeliveryStatus } from '../enums/delivery.enum.status';
import { TrackingEntity } from 'src/tracking/entities/tracking.entity';

@Entity('delivery')
export class DeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'user_id' })
  livreur: UserEntity;

  @OneToOne(() => OrderEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity | null;

  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    default: DeliveryStatus.IN_TRANSIT,
  })
  status: DeliveryStatus;

  @Column({ nullable: true })
  notes?: string;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  @Column({ type: 'time', nullable: true })
  estimatedDeliveryTime?: string;

  @OneToMany(() => TrackingEntity, (tracking) => tracking.delivery, {
    cascade: true,
  })
  trackings: TrackingEntity[];

  // 🌟 Signature stockée directement ici
  @Column({ nullable: true })
  signatureImageUrl?: string; // L'URL de l'image de la signature

  @Column({ type: 'timestamp', nullable: true })
  signedAt?: Date; // Date de signature

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
