// src/notification/entities/device-token.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('device_tokens')
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ unique: true }) // ← UN SEUL unique:true
  token: string;

  @Column({ nullable: true })
  platform: string;

  /**
   * ✅ Jeton VoIP iOS (PushKit) : l'appel (nouvelle course / commande) passe par Apple directement
   * et sonne avec l'écran d'appel natif (CallKit), même application fermée.
   */
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  voipToken?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => UserEntity, (user) => user.deviceTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}