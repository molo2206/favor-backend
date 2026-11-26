import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaSessionStatus, MediaSessionType } from '../media.enums';
import { MediaProject } from './media-project.entity';
import { MediaSessionCrew } from './media-session-crew.entity';
import { MediaSessionEquipment } from './media-session-equipment.entity';

/** Séance planifiée : tournage, shooting photo, drone, live, montage, rendez-vous client… */
@Entity('bo_media_sessions')
@Index('idx_bo_media_session_company_date', ['companyId', 'startAt'])
@Index('idx_bo_media_session_project', ['projectId'])
export class MediaSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  projectId: string;

  @ManyToOne(() => MediaProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: MediaProject;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'enum', enum: MediaSessionType, default: MediaSessionType.PHOTO })
  type: MediaSessionType;

  @Column({ type: 'datetime', precision: 6 })
  startAt: Date;

  @Column({ type: 'datetime', precision: 6 })
  endAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location?: string | null;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  latitude?: number | null;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  longitude?: number | null;

  @Column({ type: 'enum', enum: MediaSessionStatus, default: MediaSessionStatus.PLANNED })
  status: MediaSessionStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @OneToMany(() => MediaSessionCrew, (c) => c.session)
  crew: MediaSessionCrew[];

  @OneToMany(() => MediaSessionEquipment, (e) => e.session)
  equipment: MediaSessionEquipment[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
