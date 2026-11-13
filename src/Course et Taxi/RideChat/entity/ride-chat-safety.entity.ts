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

/** ✅ Motifs de signalement (exigence Apple 1.2 : contenu généré par les utilisateurs) */
export enum RideChatReportReason {
  HARASSMENT = 'HARASSMENT', // harcèlement
  HATE = 'HATE', // haine / discrimination
  SEXUAL = 'SEXUAL', // contenu sexuel
  THREAT = 'THREAT', // menaces / violence
  SPAM = 'SPAM',
  SCAM = 'SCAM', // arnaque / fraude
  OTHER = 'OTHER', // autre (précisions obligatoires)
}

export enum RideChatReportStatus {
  PENDING = 'PENDING', // à traiter (sous 24 h)
  REVIEWED = 'REVIEWED', // vu, rien à faire
  ACTION_TAKEN = 'ACTION_TAKEN', // message masqué / utilisateur sanctionné
  DISMISSED = 'DISMISSED', // rejeté
}

/** ✅ Signalement d'un message ou d'un utilisateur du chat de course */
@Entity('ride_chat_reports')
@Index('idx_rcr_status_created', ['status', 'createdAt'])
@Index('idx_rcr_reported', ['reportedUserId'])
@Index('idx_rcr_ride', ['rideId'])
export class RideChatReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  rideId: string;

  /** Message signalé (vide = signalement de l'utilisateur) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  messageId?: string | null;

  @Column({ type: 'varchar', length: 36 })
  reporterId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporterId' })
  reporter?: UserEntity;

  /** RIDER ou DRIVER */
  @Column({ type: 'varchar', length: 10 })
  reporterRole: string;

  @Column({ type: 'varchar', length: 36 })
  reportedUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reportedUserId' })
  reportedUser?: UserEntity;

  @Column({ type: 'varchar', length: 20 })
  reason: RideChatReportReason;

  @Column({ type: 'text', nullable: true })
  details?: string | null;

  /** Copie du message au moment du signalement (preuve, même s'il est supprimé ensuite) */
  @Column({ type: 'json', nullable: true })
  messageSnapshot?: Record<string, any> | null;

  /** Le signaleur a aussi bloqué l'utilisateur */
  @Column({ type: 'tinyint', default: 0 })
  alsoBlocked: boolean;

  @Column({ type: 'varchar', length: 20, default: RideChatReportStatus.PENDING })
  status: RideChatReportStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  adminNote?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewedById?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  reviewedAt?: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}

/** ✅ Blocage entre deux utilisateurs du chat (blockerId a bloqué blockedId) */
@Entity('ride_chat_blocks')
@Index('uq_rcb_pair', ['blockerId', 'blockedId'], { unique: true })
@Index('idx_rcb_blocked', ['blockedId'])
export class RideChatBlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  blockerId: string;

  @Column({ type: 'varchar', length: 36 })
  blockedId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blockedId' })
  blocked?: UserEntity;

  /** Course où le blocage a été fait (information) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  rideId?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
