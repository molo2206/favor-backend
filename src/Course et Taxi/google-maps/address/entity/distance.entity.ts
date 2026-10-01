// src/modules/address/distance.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('distances')
export class Distance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  origin_address: string;

  @Column({ type: 'text' })
  destination_address: string;

  @Column({ type: 'varchar', length: 500 })
  @Index()
  origin_normalized: string;

  @Column({ type: 'varchar', length: 500 })
  @Index()
  destination_normalized: string;

  @Column({ type: 'int' })
  distance_meters: number;

  @Column({ type: 'varchar', length: 50 })
  distance_text: string;

  @Column({ type: 'int' })
  duration_seconds: number;

  @Column({ type: 'varchar', length: 50 })
  duration_text: string;

  @Column({ type: 'varchar', length: 50, default: 'OK' })
  status: string;

  @Column({ default: 0 })
  request_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_request_at: Date;
}