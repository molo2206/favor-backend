import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { ColisTrackingEntity } from './colis-tracking.entity';

export enum ColisStatus {
  PENDING = 'PENDING',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

@Entity('colis')
export class ColisEntity {
  // UUID auto-généré
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  trackingNumber: string;

  @Column('text')
  description: string;

  @Column('float')
  weight: number;

  @Column({ type: 'float', nullable: true })
  value?: number;

  @Column({ type: 'enum', enum: ColisStatus })
  status: ColisStatus;

  @Column({ type: 'varchar', length: 255 })
  pickupAddress: string;

  @Column({ type: 'varchar', length: 255 })
  dropAddress: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'senderId' })
  sender?: UserEntity;

  @Column({ type: 'char', length: 36, nullable: true })
  senderId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'receiverId' })
  receiver?: UserEntity;

  @Column({ type: 'char', length: 36, nullable: true })
  receiverId?: string;

  @Column({ type: 'json', nullable: true })
  photos?: string[];

  @Column({ nullable: true, length: 6 })
  pin: string;

  

  @OneToMany(() => ColisTrackingEntity, (tracking) => tracking.colis, { cascade: true })
  trackings?: ColisTrackingEntity[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
