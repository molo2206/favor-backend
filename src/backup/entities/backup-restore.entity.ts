// src/backup/entities/backup-restore.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum RestoreKind {
  /** Base MySQL (.sql / .sql.gz ou copie d'une autre base) */
  DATABASE = 'DATABASE',
  /** Archive des fichiers envoyés (.tar.gz) → UPLOAD_PATH */
  FILES = 'FILES',
}

export enum RestoreSource {
  /** Fichier de sauvegarde présent sur le serveur */
  FILE = 'FILE',
  /** Fichier envoyé depuis l'administration */
  IMPORT = 'IMPORT',
  /** Copie directe d'une autre base enregistrée (mysqldump → mysql) */
  COPY = 'COPY',
}

export enum RestoreStatus {
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum RestorePhase {
  PREPARING = 'PREPARING',
  SAFETY_BACKUP = 'SAFETY_BACKUP',
  CREATING_DATABASE = 'CREATING_DATABASE',
  RESTORING = 'RESTORING',
  DONE = 'DONE',
}

/** ✅ Historique des restaurations / imports / copies de bases */
@Entity('backup_restores')
@Index('idx_backup_restores_started', ['startedAt'])
@Index('idx_backup_restores_target', ['targetDatabaseId', 'startedAt'])
export class BackupRestore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, default: RestoreKind.DATABASE })
  kind: RestoreKind;

  @Column({ type: 'varchar', length: 20, default: RestoreSource.FILE })
  sourceType: RestoreSource;

  /** Fichier restauré (BACKUP_DIR) */
  @Column({ type: 'varchar', length: 190, nullable: true })
  fileName?: string | null;

  /** Base copiée (sourceType = COPY) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  sourceDatabaseId?: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  sourceLabel?: string | null;

  /** Base cible enregistrée (null = base créée à la volée ou base de l'application) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  targetDatabaseId?: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  targetLabel?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  targetDatabaseName?: string | null;

  /** La base cible a été créée pour cette restauration */
  @Column({ default: false })
  createdDatabase: boolean;

  @Column({ type: 'varchar', length: 20, default: RestoreStatus.RUNNING })
  status: RestoreStatus;

  @Column({ type: 'varchar', length: 30, default: RestorePhase.PREPARING })
  phase: RestorePhase;

  /** 0 – 100 (inconnu pour une copie directe) */
  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'bigint', nullable: true })
  bytesTotal?: string | null;

  @Column({ type: 'bigint', nullable: true })
  bytesDone?: string | null;

  /** Sauvegarde de sécurité faite juste avant d'écraser la base cible */
  @Column({ type: 'varchar', length: 190, nullable: true })
  safetyBackupFile?: string | null;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @Column({ type: 'int', nullable: true })
  durationMs?: number | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  createdByName?: string | null;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt?: Date | null;
}
