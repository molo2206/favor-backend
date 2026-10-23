import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { SocialPlatform } from '../media.enums';
import { SocialAccount } from './social-account.entity';

/** Relevé journalier d'un compte : abonnés, nouveaux abonnés, portée, visites du profil */
@Entity('bo_social_account_daily_stats')
@Unique('uq_bo_social_account_stat_day', ['accountId', 'statDate'])
@Index('idx_bo_social_account_stat_company_day', ['companyId', 'statDate'])
export class SocialAccountDailyStat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @ManyToOne(() => SocialAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account: SocialAccount;

  @Column({ type: 'enum', enum: SocialPlatform })
  platform: SocialPlatform;

  @Column({ type: 'date' })
  statDate: string;

  /** Abonnés en fin de journée */
  @Column({ type: 'int', default: 0 }) followers: number;
  /** Variation du jour (calculée si absente) */
  @Column({ type: 'int', default: 0 }) newFollowers: number;
  @Column({ type: 'int', default: 0 }) reach: number;
  @Column({ type: 'int', default: 0 }) impressions: number;
  @Column({ type: 'int', default: 0 }) profileViews: number;
  /** Messages reçus (inbox) */
  @Column({ type: 'int', default: 0 }) messages: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  recordedById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
