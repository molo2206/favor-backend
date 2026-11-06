// src/backOffice/chat/entities/chat-participant.entity.ts
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
import { ParticipantRole } from '../enums/chat.enums';
import { ChatConversationEntity } from './chat-conversation.entity';

@Entity('bo_chat_participants')
@Index('uq_bo_chat_participant', ['conversationId', 'userId'], { unique: true })
@Index('idx_bo_chat_participant_user', ['userId'])
export class ChatParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  conversationId: string;

  @ManyToOne(() => ChatConversationEntity, (c) => c.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation?: ChatConversationEntity;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;

  @Column({ type: 'enum', enum: ParticipantRole, default: ParticipantRole.MEMBER })
  role: ParticipantRole;

  /** Nombre de messages non lus pour ce participant */
  @Column({ type: 'int', default: 0 })
  unreadCount: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  lastReadMessageId?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastReadAt?: Date | null;

  /** Dernière fois que les messages ont été reçus (accusé "distribué") */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastDeliveredAt?: Date | null;

  @Column({ type: 'boolean', default: false })
  isMuted: boolean;

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @Column({ type: 'boolean', default: false })
  isPinned: boolean;

  /** Messages antérieurs à cette date masqués ("vider la conversation") */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  clearedAt?: Date | null;

  /** Date de sortie / retrait du groupe (null = membre actif) */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  leftAt?: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  joinedAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
