// referral.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';

export enum ReferralStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  REWARDED = 'REWARDED',
  EXPIRED = 'EXPIRED',
}

@Entity('referrals')
@Index(['referrerId', 'referredId'], { unique: true })
@Index(['referralCode'])
@Index(['status'])
export class ReferralEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // L'utilisateur qui parraine
  @ManyToOne(() => UserEntity, (user) => user.referralHistory)
  @JoinColumn({ name: 'referrerId' })
  referrer: UserEntity;

  @Column({ type: 'varchar', length: 36 })
  referrerId: string;

  // L'utilisateur parrainé
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'referredId' })
  referred: UserEntity;

  @Column({ type: 'varchar', length: 36 })
  referredId: string;

  // Code de parrainage utilisé
  @Column({ type: 'varchar', length: 20 })
  referralCode: string;

  // Statut du parrainage
  @Column({
    type: 'enum',
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  // Récompense accordée
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  rewardAmount: number;

  // ✅ AJOUT DU CHAMP CURRENCY
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  // Type de récompense (points, argent, etc.)
  @Column({ type: 'varchar', length: 50, default: 'POINTS' })
  rewardType: string;

  // Date de validation du parrainage
  @Column({ type: 'datetime', nullable: true })
  completedAt?: Date;

  // Date d'expiration
  @Column({ type: 'datetime', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  // Métadonnées supplémentaires
  @Column({ type: 'json', nullable: true })
  metadata?: any;
}