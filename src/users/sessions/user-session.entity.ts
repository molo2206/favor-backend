// src/users/sessions/user-session.entity.ts
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';

/** Pourquoi une session a été fermée */
export enum SessionRevokeReason {
  LOGOUT = 'LOGOUT', // déconnexion par l'utilisateur
  REVOKED_BY_USER = 'REVOKED_BY_USER', // fermée depuis la liste « Mes appareils »
  REVOKED_BY_ADMIN = 'REVOKED_BY_ADMIN',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET = 'PASSWORD_RESET',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  TOKEN_REUSE = 'TOKEN_REUSE', // refresh token déjà utilisé : vol probable, session fermée
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED', // trop de sessions ouvertes : la plus ancienne est fermée
  EXPIRED = 'EXPIRED',
  OUTSIDE_WORK_HOURS = 'OUTSIDE_WORK_HOURS', // fin des horaires de travail : déconnexion automatique
}

/**
 * ✅ Session de connexion : une par appareil / navigateur connecté.
 * L'identifiant (sid) est inscrit dans les jetons ; fermer la session invalide immédiatement ses jetons.
 * Le refresh token n'est jamais stocké en clair (empreinte SHA-256, rotation à chaque renouvellement).
 */
@Entity('user_sessions')
@Index('idx_user_sessions_user', ['userId', 'revokedAt'])
@Index('idx_user_sessions_expires', ['expiresAt'])
@Index('idx_user_sessions_last', ['lastActiveAt'])
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', createForeignKeyConstraints: false })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;

  /** PASSWORD, GOOGLE, APPLE, SIGNUP, OTP, REFRESH (ancien jeton repris), OTHER */
  @Column({ type: 'varchar', length: 20, default: 'PASSWORD' })
  loginMethod: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent?: string | null;

  /** ios, android, web, admin, group… (en-tête x-platform) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  platform?: string | null;

  /** En-tête x-device-id envoyé par l'application (facultatif) */
  @Column({ type: 'varchar', length: 150, nullable: true })
  deviceId?: string | null;

  /** « Chrome sur Windows », « Application Android », ou en-tête x-device-name */
  @Column({ type: 'varchar', length: 150, nullable: true })
  deviceName?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  appVersion?: string | null;

  /** Empreinte SHA-256 du refresh token en cours */
  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  refreshTokenHash?: string | null;

  /** Empreinte du refresh token précédent (tolérance de quelques secondes aux appels simultanés) */
  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  previousRefreshHash?: string | null;

  @Column({ type: 'datetime', nullable: true })
  refreshRotatedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime' })
  lastActiveAt: Date;

  /** Fin de validité (prolongée à chaque renouvellement du jeton) */
  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  revokedAt?: Date | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  revokedReason?: SessionRevokeReason | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  revokedNote?: string | null;

  /** Administrateur ou utilisateur qui a fermé la session */
  @Column({ type: 'varchar', length: 36, nullable: true })
  revokedById?: string | null;
}
