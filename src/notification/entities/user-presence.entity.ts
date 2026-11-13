// src/notification/entities/user-presence.entity.ts
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';

export enum PresenceStatus {
  ONLINE = 'ONLINE',
  AWAY = 'AWAY',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

/**
 * Présence persistée (dernière connexion, statut choisi).
 * L'état "en ligne" temps réel est tenu en mémoire par PresenceService.
 */
@Entity('user_presence')
export class UserPresenceEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  userId: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;

  @Column({ type: 'boolean', default: false })
  isOnline: boolean;

  @Column({ type: 'enum', enum: PresenceStatus, default: PresenceStatus.OFFLINE })
  status: PresenceStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastSeenAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastConnectedAt?: Date | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  platform?: string | null;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
