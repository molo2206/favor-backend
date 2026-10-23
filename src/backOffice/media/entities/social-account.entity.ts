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
import { SocialPlatform } from '../media.enums';
import { MediaProject } from './media-project.entity';

/** Compte / page géré sur un réseau social (de l'entreprise ou d'un client) */
@Entity('bo_social_accounts')
@Index('idx_bo_social_account_company', ['companyId', 'platform'])
@Index('idx_bo_social_account_project', ['projectId'])
export class SocialAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'enum', enum: SocialPlatform })
  platform: SocialPlatform;

  /** Nom affiché de la page / du compte */
  @Column({ type: 'varchar', length: 150 })
  name: string;

  /** @identifiant */
  @Column({ type: 'varchar', length: 150, nullable: true })
  handle?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  url?: string | null;

  /** Projet média (contrat de gestion des réseaux d'un client) — null = comptes de l'entreprise */
  @Column({ type: 'varchar', length: 36, nullable: true })
  projectId?: string | null;

  @ManyToOne(() => MediaProject, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'projectId' })
  project?: MediaProject | null;

  /** Client (si compte d'un client) */
  @Column({ type: 'varchar', length: 150, nullable: true })
  clientName?: string | null;

  /** Community manager responsable */
  @Column({ type: 'varchar', length: 36, nullable: true })
  managerId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'managerId' })
  manager?: UserEntity | null;

  /** Abonnés au dernier relevé */
  @Column({ type: 'int', default: 0 })
  followers: number;

  @Column({ type: 'date', nullable: true })
  followersUpdatedOn?: string | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
