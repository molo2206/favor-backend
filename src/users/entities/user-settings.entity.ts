// src/users/entities/user-settings.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('user_settings')
@Unique('UQ_user_settings_user_id', ['userId'])
@Index('idx_user_settings_user', ['userId'])
export class UserSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 10, default: 'fr' })
  language: string;

  @Column({
    type: 'enum',
    enum: ['light', 'dark', 'system'],
    default: 'system',
  })
  theme: string; // ou UserSettingsTheme si vous utilisez l'enum

  @Column({ name: 'email_notifications', type: 'boolean', default: true })
  emailNotifications: boolean;

  @Column({ name: 'sms_notifications', type: 'boolean', default: true })
  smsNotifications: boolean;

  @Column({ name: 'push_notifications', type: 'boolean', default: true })
  pushNotifications: boolean;

  @Column({ name: 'two_factor_enabled', type: 'boolean', default: false })
  twoFactorEnabled: boolean;

  @Column({ name: 'last_device', type: 'varchar', length: 255, nullable: true })
  lastDevice: string;

  @Column({ default: true })
  whatsappNotifications: boolean;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  // Relation Many-to-One avec User (en réalité One-to-One, mais TypeORM utilise ManyToOne avec unique)
  @ManyToOne(() => UserEntity, (user) => user.settings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'USD',
    nullable: true
  })
  currency: string;
}
