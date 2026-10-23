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
import { UserEntity } from 'src/users/entities/user.entity';
import { SocialPostStatus, SocialPostType } from '../media.enums';
import { MediaProject } from './media-project.entity';
import { SocialPostTarget } from './social-post-target.entity';

/** Publication : ce qu'on poste (texte, visuels, vidéo), une ou plusieurs plateformes */
@Entity('bo_social_posts')
@Index('idx_bo_social_post_company_status', ['companyId', 'status'])
@Index('idx_bo_social_post_scheduled', ['companyId', 'scheduledAt'])
export class SocialPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  projectId?: string | null;

  @ManyToOne(() => MediaProject, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'projectId' })
  project?: MediaProject | null;

  /** Titre interne (ex. « Promo Black Friday — J-3 ») */
  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** Texte publié (légende) */
  @Column({ type: 'text', nullable: true })
  caption?: string | null;

  @Column({ type: 'json', nullable: true })
  hashtags?: string[] | null;

  @Column({ type: 'enum', enum: SocialPostType, default: SocialPostType.IMAGE })
  type: SocialPostType;

  /** Fichiers de la médiathèque utilisés (bo_media_files) */
  @Column({ type: 'json', nullable: true })
  mediaFileIds?: string[] | null;

  /** Lien externe mis en avant */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  link?: string | null;

  /** Thème / campagne libre (ex. « Rentrée », « Lancement produit ») */
  @Column({ type: 'varchar', length: 120, nullable: true })
  campaign?: string | null;

  @Column({ type: 'enum', enum: SocialPostStatus, default: SocialPostStatus.DRAFT })
  status: SocialPostStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  scheduledAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  publishedAt?: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  approvedById?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  approvedAt?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: UserEntity | null;

  @OneToMany(() => SocialPostTarget, (t) => t.post)
  targets: SocialPostTarget[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
