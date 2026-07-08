// src/notification/entities/user-notification.entity.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('user_notifications')
@Index('IDX_user_notifications_userId', ['userId'])
export class UserNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, (user) => user.notifications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'boolean', default: false })
  hasSeen: boolean; // ✅ correspond à 'has_seen'

  @Column({ type: 'longtext', nullable: true }) // ✅ String? et @db.LongText
  data: string | null; // on change le type en string (ou Record<string, any> selon usage)

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
