// src/backup/entities/backup-schedule.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * ✅ Programmation d'une sauvegarde automatique de la base.
 *    times : heures locales "HH:mm" (ex. ["02:00","14:00"])
 *    days  : jours de la semaine 1 = lundi … 7 = dimanche (vide / null = tous les jours)
 */
@Entity('backup_schedules')
export class BackupSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  @Column('simple-json')
  times: string[];

  @Column('simple-json', { nullable: true })
  days?: number[] | null;

  /** Fuseau horaire des heures (ex. Africa/Lubumbashi) */
  @Column({ length: 60, default: 'Africa/Lubumbashi' })
  timezone: string;

  /** Nombre de sauvegardes de cette programmation à garder (les plus anciennes sont supprimées) */
  @Column({ type: 'int', default: 14 })
  keepLast: number;

  /** Sauvegarder aussi les fichiers envoyés (UPLOAD_PATH) dans une archive .tar.gz */
  @Column({ default: false })
  includeUploads: boolean;

  @Column({ default: true })
  isActive: boolean;

  /** ✅ Base MySQL sauvegardée (null = base par défaut) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  databaseId?: string | null;

  /** Dernier créneau exécuté ("2026-11-02 02:00") : évite de lancer deux fois la même sauvegarde */
  @Column({ type: 'varchar', length: 20, nullable: true })
  lastSlot?: string | null;

  @Column({ type: 'datetime', nullable: true })
  lastRunAt?: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  lastStatus?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
