// src/system-settings/system-setting.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * ✅ Paramètres de l'application gérés depuis l'administration (remplacent les clés du .env).
 *  - Une ligne active (isActive = 1) remplace la valeur du .env au démarrage et à chaud.
 *  - Ligne désactivée ou supprimée → la valeur du .env est de nouveau utilisée.
 *  - Secrets (isSecret = 1) : valeur chiffrée AES-256-GCM (préfixe « sv1: »).
 */
@Entity('system_settings')
@Index('idx_system_settings_category', ['category'])
export class SystemSetting {
  /** Nom de la clé, ex. OPENAI_API_KEY */
  @PrimaryColumn({ type: 'varchar', length: 100 })
  settingKey: string;

  @Column({ type: 'mediumtext', nullable: true })
  value?: string | null;

  @Column({ default: false })
  isSecret: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 40, default: 'other' })
  category: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedById?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  updatedByName?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export enum SettingHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  ENABLE = 'ENABLE',
  DISABLE = 'DISABLE',
  DELETE = 'DELETE',
  IMPORT = 'IMPORT',
  ROLLBACK = 'ROLLBACK',
}

/** ✅ Historique des modifications (anciennes valeurs chiffrées pour les secrets) */
@Entity('system_setting_history')
@Index('idx_system_setting_history_key', ['settingKey', 'createdAt'])
export class SystemSettingHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  settingKey: string;

  @Column({ type: 'varchar', length: 20 })
  action: SettingHistoryAction;

  @Column({ type: 'mediumtext', nullable: true })
  oldValue?: string | null;

  @Column({ type: 'mediumtext', nullable: true })
  newValue?: string | null;

  @Column({ default: false })
  isSecret: boolean;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  changedById?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  changedByName?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
