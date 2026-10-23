import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { SocialPlatform, SocialTargetStatus } from '../media.enums';
import { SocialAccount } from './social-account.entity';
import { SocialPost } from './social-post.entity';
import { SocialPostDailyStat } from './social-post-daily-stat.entity';

/**
 * Une publication sur UN compte / une plateforme (la même publication peut partir
 * sur Facebook, Instagram et TikTok : une ligne par compte).
 * Les totaux (j'aime, commentaires…) sont recalculés à chaque saisie journalière.
 */
@Entity('bo_social_post_targets')
@Unique('uq_bo_social_target', ['postId', 'accountId'])
@Index('idx_bo_social_target_account', ['accountId', 'publishedAt'])
export class SocialPostTarget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  postId: string;

  @ManyToOne(() => SocialPost, (p) => p.targets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: SocialPost;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @ManyToOne(() => SocialAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account: SocialAccount;

  /** Copie de la plateforme du compte (filtres et rapports rapides) */
  @Column({ type: 'enum', enum: SocialPlatform })
  platform: SocialPlatform;

  @Column({ type: 'enum', enum: SocialTargetStatus, default: SocialTargetStatus.PLANNED })
  status: SocialTargetStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  publishedAt?: Date | null;

  /** Lien de la publication sur le réseau */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  postUrl?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId?: string | null;

  /** Budget sponsorisé dépensé (boost) */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  boostSpent: number;

  // ---------- Totaux (somme des relevés journaliers) ----------
  @Column({ type: 'int', default: 0 }) likes: number;
  @Column({ type: 'int', default: 0 }) comments: number;
  @Column({ type: 'int', default: 0 }) shares: number;
  @Column({ type: 'int', default: 0 }) saves: number;
  @Column({ type: 'int', default: 0 }) views: number;
  @Column({ type: 'int', default: 0 }) reach: number;
  @Column({ type: 'int', default: 0 }) impressions: number;
  @Column({ type: 'int', default: 0 }) clicks: number;

  @Column({ type: 'date', nullable: true })
  lastStatsOn?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @OneToMany(() => SocialPostDailyStat, (s) => s.target)
  dailyStats: SocialPostDailyStat[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
