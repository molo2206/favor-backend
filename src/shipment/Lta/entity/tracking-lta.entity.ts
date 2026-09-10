import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LtaEntity } from './lta.entity';
import { UserEntity } from 'src/users/entities/user.entity';

export enum TrackingltaType {
  DEPARTURE = 'departure',
  ARRIVAL = 'arrival',
  TRANSIT = 'transit',
}

@Entity('tracking_lta')
export class TrackingltaEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ nullable: true, type: 'timestamp' })
  time: Date;

  @Column({ default: false })
  completed: boolean;

  @Column({ type: 'enum', enum: TrackingltaType })
  type: TrackingltaType;

  @ManyToOne(() => LtaEntity, (lta) => lta.tracking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ltaId' })
  lta: LtaEntity;

  @Column({ type: 'char', length: 36 })
  ltaId: string; // UUID

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  // ---- Audit ----
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'createdById' })
  createdBy: UserEntity;

  @Column({ type: 'char', length: 36 })
  createdById: string; // UUID

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'updatedById' })
  updatedBy: UserEntity;

  @Column({ type: 'char', length: 36 })
  updatedById: string; // UUID
}
