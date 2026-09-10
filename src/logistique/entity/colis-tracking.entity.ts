import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ColisEntity } from './colis.entity';
import { UserEntity } from 'src/users/entities/user.entity';

export enum ColisTrackingStatus {
  PENDING = 'PENDING',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

@Entity('colis_tracking')
export class ColisTrackingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // FK vers ColisEntity
  @Column({ type: 'char', length: 36 })
  colisId: string;

  @ManyToOne(() => ColisEntity, (colis) => colis.trackings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'colisId' })
  colis: ColisEntity;

  // Statut
  @Column({ type: 'enum', enum: ColisTrackingStatus })
  status: ColisTrackingStatus;

  // Localisation optionnelle
  @Column({ type: 'varchar', length: 255, nullable: true })
  location?: string;

  // FK vers UserEntity (qui a mis à jour le statut)
  @Column({ type: 'char', length: 36, nullable: true })
  updatedById?: string;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'updatedById' })
  updatedBy?: UserEntity;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
  
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
