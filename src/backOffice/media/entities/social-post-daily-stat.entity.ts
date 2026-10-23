import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { SocialPlatform } from '../media.enums';
import { SocialPostTarget } from './social-post-target.entity';

/** Chiffres d'UNE journée pour une publication sur une plateforme (j'aime, commentaires… gagnés ce jour-là) */
@Entity('bo_social_post_daily_stats')
@Unique('uq_bo_social_post_stat_day', ['targetId', 'statDate'])
@Index('idx_bo_social_post_stat_company_day', ['companyId', 'statDate'])
export class SocialPostDailyStat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  targetId: string;

  @ManyToOne(() => SocialPostTarget, (t) => t.dailyStats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetId' })
  target: SocialPostTarget;

  @Column({ type: 'varchar', length: 36 })
  postId: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'enum', enum: SocialPlatform })
  platform: SocialPlatform;

  @Column({ type: 'date' })
  statDate: string;

  @Column({ type: 'int', default: 0 }) likes: number;
  @Column({ type: 'int', default: 0 }) comments: number;
  @Column({ type: 'int', default: 0 }) shares: number;
  @Column({ type: 'int', default: 0 }) saves: number;
  @Column({ type: 'int', default: 0 }) views: number;
  @Column({ type: 'int', default: 0 }) reach: number;
  @Column({ type: 'int', default: 0 }) impressions: number;
  @Column({ type: 'int', default: 0 }) clicks: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  recordedById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
