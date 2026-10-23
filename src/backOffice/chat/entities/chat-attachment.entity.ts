// src/backOffice/chat/entities/chat-attachment.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AttachmentType } from '../enums/chat.enums';
import { ChatMessageEntity } from './chat-message.entity';

@Entity('bo_chat_attachments')
@Index('idx_bo_chat_att_message', ['messageId'])
@Index('idx_bo_chat_att_conv_type', ['conversationId', 'type'])
export class ChatAttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  messageId: string;

  @ManyToOne(() => ChatMessageEntity, (m) => m.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message?: ChatMessageEntity;

  /** Dupliqué pour lister rapidement les médias d'une conversation */
  @Column({ type: 'varchar', length: 36 })
  conversationId: string;

  @Column({ type: 'enum', enum: AttachmentType })
  type: AttachmentType;

  @Column({ type: 'varchar', length: 700 })
  url: string;

  /** Chemin relatif dans UPLOAD_PATH (pour la suppression physique) */
  @Column({ type: 'varchar', length: 500 })
  storagePath: string;

  @Column({ type: 'varchar', length: 700, nullable: true })
  thumbnailUrl?: string | null;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 150 })
  mimeType: string;

  /** Taille en octets */
  @Column({ type: 'bigint', default: 0 })
  size: number;

  @Column({ type: 'int', nullable: true })
  width?: number | null;

  @Column({ type: 'int', nullable: true })
  height?: number | null;

  /** Durée en secondes (audio / vidéo) */
  @Column({ type: 'float', nullable: true })
  duration?: number | null;

  /** Forme d'onde (notes vocales), fournie par le client */
  @Column({ type: 'simple-json', nullable: true })
  waveform?: number[] | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
