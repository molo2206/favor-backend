// src/modules/address/direction.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('directions')
export class Direction {
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

  @Column({ type: 'int' })
  duration_seconds: number;

  @Column({ type: 'text', nullable: true })
  polyline: string;

  @Column({ type: 'text' })
  start_address: string;

  @Column({ type: 'text' })
  end_address: string;

  @Column({ type: 'json', nullable: true })
  full_route: any; // Pour stocker l'itinéraire complet si besoin

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