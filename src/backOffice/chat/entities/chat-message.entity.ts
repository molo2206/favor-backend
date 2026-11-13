// src/backOffice/chat/entities/chat-message.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { MessageType } from '../enums/chat.enums';
import { ChatConversationEntity } from './chat-conversation.entity';
import { ChatAttachmentEntity } from './chat-attachment.entity';
import { ChatReactionEntity } from './chat-reaction.entity';

@Entity('bo_chat_messages')
@Index('idx_bo_chat_msg_conv_created', ['conversationId', 'createdAt'])
@Index('uq_bo_chat_msg_client_id', ['senderId', 'clientMessageId'], { unique: true })
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  conversationId: string;

  @ManyToOne(() => ChatConversationEntity, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation?: ChatConversationEntity;

  /** null pour les messages SYSTEM */
  @Column({ type: 'varchar', length: 36, nullable: true })
  senderId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'senderId' })
  sender?: UserEntity | null;

  @Column({ type: 'enum', enum: MessageType, default: MessageType.TEXT })
  type: MessageType;

  @Column({ type: 'text', nullable: true })
  content?: string | null;

  /** Identifiant généré côté client pour éviter les doublons (retry réseau) */
  @Column({ type: 'varchar', length: 64, nullable: true })
  clientMessageId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  replyToId?: string | null;

  @ManyToOne(() => ChatMessageEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replyToId' })
  replyTo?: ChatMessageEntity | null;

  /** Message d'origine si transféré */
  @Column({ type: 'varchar', length: 36, nullable: true })
  forwardedFromId?: string | null;

  /** userIds mentionnés (@) */
  @Column({ type: 'simple-json', nullable: true })
  mentions?: string[] | null;

  /** Données libres (messages système, etc.) */
  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'boolean', default: false })
  isEdited: boolean;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  editedAt?: Date | null;

  @Column({ type: 'boolean', default: false })
  isPinned: boolean;

  /** Supprimé pour tout le monde */
  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  deletedAt?: Date | null;

  /** userIds ayant supprimé ce message "pour moi" */
  @Column({ type: 'simple-json', nullable: true })
  hiddenFor?: string[] | null;

  @OneToMany(() => ChatAttachmentEntity, (a) => a.message, { cascade: true })
  attachments?: ChatAttachmentEntity[];

  @OneToMany(() => ChatReactionEntity, (r) => r.message)
  reactions?: ChatReactionEntity[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
