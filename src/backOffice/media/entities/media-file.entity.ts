import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { MediaFileType } from '../media.enums';
import { MediaProject } from './media-project.entity';

/** Médiathèque : photos, vidéos, documents ou liens d'un projet ; portfolio public */
@Entity('bo_media_files')
@Index('idx_bo_media_file_company', ['companyId', 'createdAt'])
@Index('idx_bo_media_file_project', ['projectId'])
@Index('idx_bo_media_file_portfolio', ['companyId', 'isPortfolio'])
export class MediaFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  projectId?: string | null;

  @ManyToOne(() => MediaProject, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'projectId' })
  project?: MediaProject | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sessionId?: string | null;

  @Column({ type: 'enum', enum: MediaFileType })
  type: MediaFileType;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 1000 })
  url: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  thumbnailUrl?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mimeType?: string | null;

  @Column({ type: 'bigint', nullable: true })
  sizeBytes?: number | null;

  @Column({ type: 'int', nullable: true })
  width?: number | null;

  @Column({ type: 'int', nullable: true })
  height?: number | null;

  /** Durée (secondes) pour les vidéos / audios */
  @Column({ type: 'int', nullable: true })
  duration?: number | null;

  /** Fichier livré au client (visible dans son lien de livraison) */
  @Column({ default: false })
  isDeliverable: boolean;

  /** Visible dans le portfolio public */
  @Column({ default: false })
  isPortfolio: boolean;

  @Column({ type: 'json', nullable: true })
  tags?: string[] | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  uploadedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy?: UserEntity | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
