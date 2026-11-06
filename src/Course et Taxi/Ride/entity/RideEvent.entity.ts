import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RideEventType } from '../enum/ride-event.enum';
import { Ride } from './Ride.entity';

/** Historique complet d'une course (création, offres, acceptation, trajet, fin, annulation…) */
@Entity('ride_events')
@Index('idx_ride_events_ride_date', ['rideId', 'createdAt'])
export class RideEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  rideId: string;

  @ManyToOne(() => Ride, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rideId' })
  ride: Ride;

  @Column({ type: 'varchar', length: 40 })
  type: RideEventType;

  @Column({ type: 'varchar', length: 30, nullable: true })
  fromStatus?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  toStatus?: string | null;

  /** Utilisateur à l'origine de l'étape (null = système) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  actorRole?: string | null;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  lat?: number | null;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  lng?: number | null;

  @Column({ type: 'json', nullable: true })
  payload?: Record<string, any> | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
