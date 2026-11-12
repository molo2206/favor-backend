import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { MediaCrewRole } from '../media.enums';
import { MediaSession } from './media-session.entity';

/** Membre de l'équipe affecté à une séance */
@Entity('bo_media_session_crew')
@Unique('uq_bo_media_crew', ['sessionId', 'userId'])
@Index('idx_bo_media_crew_user', ['userId'])
export class MediaSessionCrew {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  @ManyToOne(() => MediaSession, (s) => s.crew, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: MediaSession;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'enum', enum: MediaCrewRole, default: MediaCrewRole.OTHER })
  role: MediaCrewRole;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
