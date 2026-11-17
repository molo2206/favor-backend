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
import { Ride } from 'src/Course et Taxi/Ride/entity/Ride.entity';

/** Type de message du chat chauffeur ↔ client */
export enum RideChatMessageType {
  TEXT = 'TEXT',
  AUDIO = 'AUDIO',
}

/** Rôle de l'expéditeur dans la course */
export enum RideChatSenderRole {
  RIDER = 'RIDER',
  DRIVER = 'DRIVER',
}

/**
 * ✅ Chat d'une course : une conversation par course (rideId), entre le passager et le chauffeur.
 * Messages texte ou vocaux (fichier audio stocké par FilesService dans uploads/ride-chat/…).
 * Rien n'est supprimé physiquement : une suppression (par l'expéditeur ou l'admin) masque le
 * message aux participants mais il reste visible dans l'historique de l'administration.
 */
@Entity('ride_chat_messages')
@Index('idx_ride_chat_ride_created', ['rideId', 'createdAt'])
@Index('idx_ride_chat_sender', ['senderId'])
@Index('idx_ride_chat_recipient_read', ['recipientId', 'readAt'])
@Index('uq_ride_chat_client_msg', ['rideId', 'senderId', 'clientMessageId'], { unique: true })
@Index('idx_ride_chat_reply', ['replyToId'])
export class RideChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ride, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rideId' })
  ride?: Ride;

  @Column({ type: 'varchar', length: 36 })
  rideId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderId' })
  sender?: UserEntity;

  @Column({ type: 'varchar', length: 36 })
  senderId: string;

  @Column({ type: 'enum', enum: RideChatSenderRole })
  senderRole: RideChatSenderRole;

  /** Destinataire (l'autre participant au moment de l'envoi) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  recipientId?: string | null;

  @Column({ type: 'enum', enum: RideChatMessageType, default: RideChatMessageType.TEXT })
  type: RideChatMessageType;

  @Column({ type: 'text', nullable: true })
  text?: string | null;

  // ---------------- Message vocal ----------------
  @Column({ type: 'varchar', length: 500, nullable: true })
  audioUrl?: string | null;

  /** Durée en secondes */
  @Column({ type: 'int', nullable: true })
  audioDuration?: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  audioMimeType?: string | null;

  /** Taille en octets */
  @Column({ type: 'int', nullable: true })
  audioSize?: number | null;

  // ---------------- Réponse à un message ----------------
  /** ✅ Message auquel celui-ci répond (même course) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  replyToId?: string | null;

  @ManyToOne(() => RideChatMessage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replyToId' })
  replyTo?: RideChatMessage | null;

  /**
   * ✅ « Supprimer pour moi » : identifiants des participants qui ne voient plus ce message.
   * Le message reste visible pour l'autre participant et TOUJOURS pour l'administration.
   */
  @Column({ type: 'simple-json', nullable: true })
  hiddenFor?: string[] | null;

  /** Identifiant généré par l'application (anti-doublon en cas de renvoi après coupure réseau) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  clientMessageId?: string | null;

  // ---------------- Réception / lecture ----------------
  @Column({ type: 'datetime', precision: 6, nullable: true })
  deliveredAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  readAt?: Date | null;

  // ---------------- Suppression (masqué, conservé pour l'admin) ----------------
  @Column({ type: 'tinyint', default: 0 })
  isDeleted: boolean;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  deletedAt?: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  deletedById?: string | null;

  /** SENDER (l'expéditeur) ou ADMIN (modération) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  deletedBy?: 'SENDER' | 'ADMIN' | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  deletedReason?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
