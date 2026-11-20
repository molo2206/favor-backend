// src/backOffice/chat/entities/chat-conversation.entity.ts
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
import { ConversationType } from '../enums/chat.enums';
import { ChatParticipantEntity } from './chat-participant.entity';
import { ChatMessageEntity } from './chat-message.entity';

@Entity('bo_chat_conversations')
@Index('idx_bo_chat_conv_last_message_at', ['lastMessageAt'])
export class ChatConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ConversationType, default: ConversationType.DIRECT })
  type: ConversationType;

  /** Nom du groupe (null pour une conversation directe) */
  @Column({ type: 'varchar', length: 150, nullable: true })
  name?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatar?: string | null;

  /**
   * Clé unique pour les conversations directes : "<userIdA>:<userIdB>" triés.
   * Empêche la création de doublons entre 2 employés.
   */
  @Index('uq_bo_chat_conv_direct_key', { unique: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  directKey?: string | null;

  @Index('idx_bo_chat_conv_company')
  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: UserEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  lastMessageId?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastMessageAt?: Date | null;

  /** Si true, seuls les admins du groupe peuvent écrire */
  @Column({ type: 'boolean', default: false })
  onlyAdminsCanWrite: boolean;

  @OneToMany(() => ChatParticipantEntity, (p) => p.conversation)
  participants?: ChatParticipantEntity[];

  @OneToMany(() => ChatMessageEntity, (m) => m.conversation)
  messages?: ChatMessageEntity[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
