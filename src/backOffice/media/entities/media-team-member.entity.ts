import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';

/** Membre de l'équipe média (photographe, vidéaste, monteur, designer…) */
@Entity('bo_media_team_members')
@Unique('uq_bo_media_team_member', ['companyId', 'userId'])
export class MediaTeamMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  /** Rôles possibles : ["PHOTOGRAPHER","EDITOR"] */
  @Column({ type: 'json', nullable: true })
  roles?: string[] | null;

  /** Spécialités libres : mariage, corporate, drone, motion design… */
  @Column({ type: 'varchar', length: 500, nullable: true })
  skills?: string | null;

  /** Coût / tarif journalier (pour estimer les coûts de production) */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  dayRate?: number | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
