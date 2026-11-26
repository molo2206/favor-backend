import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { MediaEventType } from '../media.enums';
import { MediaProject } from './media-project.entity';

/** Historique complet d'un projet média */
@Entity('bo_media_project_events')
@Index('idx_bo_media_event_project_date', ['projectId', 'createdAt'])
export class MediaProjectEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  projectId: string;

  @ManyToOne(() => MediaProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: MediaProject;

  @Column({ type: 'enum', enum: MediaEventType })
  type: MediaEventType;

  @Column({ type: 'varchar', length: 30, nullable: true })
  fromStatus?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  toStatus?: string | null;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ type: 'json', nullable: true })
  payload?: Record<string, any> | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorId' })
  actor?: UserEntity | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
