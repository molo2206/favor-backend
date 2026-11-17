// src/backup/entities/backup-run.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum BackupTrigger {
  SCHEDULED = 'SCHEDULED',
  MANUAL = 'MANUAL',
  BEFORE_RESTORE = 'BEFORE_RESTORE',
  /** ✅ Fichier .sql / .sql.gz envoyé depuis l'administration */
  IMPORT = 'IMPORT',
}

export enum BackupStatus {
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

/** ✅ Historique des sauvegardes (automatiques et manuelles) */
@Entity('backup_runs')
@Index('idx_backup_runs_started', ['startedAt'])
@Index('idx_backup_runs_schedule', ['scheduleId', 'status'])
@Index('idx_backup_runs_database', ['databaseId', 'startedAt'])
export class BackupRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  scheduleId?: string | null;

  @Column({ type: 'varchar', length: 20, default: BackupTrigger.MANUAL })
  trigger: BackupTrigger;

  /** ✅ Base MySQL sauvegardée */
  @Column({ type: 'varchar', length: 36, nullable: true })
  databaseId?: string | null;

  /** Libellé au moment de la sauvegarde (ex. « Base principale — favor_db@127.0.0.1 ») */
  @Column({ type: 'varchar', length: 200, nullable: true })
  databaseLabel?: string | null;

  @Column({ type: 'varchar', length: 20, default: BackupStatus.RUNNING })
  status: BackupStatus;

  /** Fichier de la base (.sql.gz) */
  @Column({ type: 'varchar', length: 190, nullable: true })
  fileName?: string | null;

  @Column({ type: 'bigint', nullable: true })
  sizeBytes?: string | null;

  /** Archive des fichiers envoyés (.tar.gz), si demandée */
  @Column({ type: 'varchar', length: 190, nullable: true })
  uploadsFileName?: string | null;

  @Column({ type: 'bigint', nullable: true })
  uploadsSizeBytes?: string | null;

  @Column({ type: 'int', nullable: true })
  durationMs?: number | null;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  /** Fichiers supprimés par la rotation (keepLast) */
  @Column({ default: false })
  deleted: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt?: Date | null;
}
