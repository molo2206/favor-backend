import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { MediaContentType, MediaPublicationStatus } from '../media.enums';
import { MediaProject } from './media-project.entity';
import { MediaPublicationStat } from './media-publication-stat.entity';

/**
 * ✅ Publication du média interne : ce qu'on a diffusé (photo, vidéo, texte…), où (texte libre),
 * et ses chiffres (vues, j'aime, commentaires, partages) saisis À LA MAIN par l'admin.
 * Aucun lien avec un site web ou une API de réseau social.
 */
@Entity('bo_media_publications')
@Index('idx_bo_media_publication_company', ['companyId', 'status', 'publishedAt'])
export class MediaPublication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  /** Projet média lié (facultatif) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  projectId?: string | null;

  @ManyToOne(() => MediaProject, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'projectId' })
  project?: MediaProject | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'enum', enum: MediaContentType, default: MediaContentType.PHOTO })
  type: MediaContentType;

  /** Où c'est diffusé (texte libre) : « Facebook », « WhatsApp », « Écran de l'accueil », « Journal interne »… */
  @Column({ type: 'json', nullable: true })
  channels?: string[] | null;

  /** Image de couverture (envoyée avec la publication) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  coverUrl?: string | null;

  /** Fichiers de la médiathèque (bo_media_files) */
  @Column({ type: 'json', nullable: true })
  mediaFileIds?: string[] | null;

  @Column({ type: 'enum', enum: MediaPublicationStatus, default: MediaPublicationStatus.DRAFT })
  status: MediaPublicationStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  publishedAt?: Date | null;

  // ---------- Chiffres actuels (dernier relevé saisi par l'admin) ----------
  @Column({ type: 'int', default: 0 }) views: number;
  @Column({ type: 'int', default: 0 }) likes: number;
  @Column({ type: 'int', default: 0 }) comments: number;
  @Column({ type: 'int', default: 0 }) shares: number;

  @Column({ type: 'date', nullable: true })
  lastStatsOn?: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: UserEntity | null;

  @OneToMany(() => MediaPublicationStat, (s) => s.publication)
  stats: MediaPublicationStat[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
