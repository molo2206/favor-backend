// src/backOffice/chat/entities/chat-reaction.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { ChatMessageEntity } from './chat-message.entity';

@Entity('bo_chat_reactions')
@Index('uq_bo_chat_reaction', ['messageId', 'userId', 'emoji'], { unique: true })
export class ChatReactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  messageId: string;

  @ManyToOne(() => ChatMessageEntity, (m) => m.reactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message?: ChatMessageEntity;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 32 })
  emoji: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
