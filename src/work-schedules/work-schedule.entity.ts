// src/work-schedules/work-schedule.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Valeur de scopeKey pour le programme de l'entreprise (règle par défaut) */
export const COMPANY_SCOPE = 'COMPANY';

/**
 * ✅ Programme de travail.
 *  - userId NULL  → programme de l'entreprise (règle par défaut pour tous ses utilisateurs)
 *  - userId rempli → programme individuel (prioritaire sur celui de l'entreprise)
 *  scopeKey = userId ou 'COMPANY' : un seul programme par (entreprise, portée).
 */
@Entity('work_schedules')
@Index('uq_work_schedule_scope', ['companyId', 'scopeKey'], { unique: true })
@Index('idx_work_schedule_user', ['userId'])
export class WorkSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  userId?: string | null;

  @Column({ type: 'varchar', length: 36 })
  scopeKey: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Fuseau horaire IANA (ex. Africa/Lubumbashi). NULL = fuseau de l'entreprise, sinon WORK_SCHEDULE_DEFAULT_TIMEZONE */
  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone?: string | null;

  @Column({ type: 'tinyint', default: 1 })
  isActive: boolean;

  /** Tolérance (minutes) avant le début et après la fin de chaque plage */
  @Column({ type: 'int', default: 0 })
  graceMinutes: number;

  /** Programme de l'entreprise : s'applique aussi aux propriétaires de l'entreprise */
  @Column({ type: 'tinyint', default: 0 })
  applyToOwners: boolean;

  /** Verrouillé par un Super Admin : l'entreprise ne peut plus le modifier ni le supprimer */
  @Column({ type: 'tinyint', default: 0 })
  isLocked: boolean;

  /** Période d'application (AAAA-MM-JJ, incluses). NULL = sans limite */
  @Column({ type: 'date', nullable: true })
  validFrom?: string | null;

  @Column({ type: 'date', nullable: true })
  validUntil?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;

  @OneToMany(() => WorkScheduleSlot, (s) => s.schedule, { cascade: true })
  slots?: WorkScheduleSlot[];
}

/**
 * ✅ Plage horaire d'un programme.
 *  dayOfWeek : 1 = lundi … 7 = dimanche.
 *  startTime / endTime : « HH:mm ». Si endTime <= startTime, la plage se termine le lendemain (travail de nuit).
 *  « 00:00 → 00:00 » = journée entière.
 */
@Entity('work_schedule_slots')
@Index('idx_work_schedule_slot_schedule', ['scheduleId', 'dayOfWeek'])
export class WorkScheduleSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  scheduleId: string;

  @ManyToOne(() => WorkSchedule, (s) => s.slots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule?: WorkSchedule;

  @Column({ type: 'tinyint' })
  dayOfWeek: number;

  @Column({ type: 'char', length: 5 })
  startTime: string;

  @Column({ type: 'char', length: 5 })
  endTime: string;
}

/**
 * ✅ Dérogation exceptionnelle : autorisation temporaire d'accès en dehors du programme
 *    (heures supplémentaires, inventaire, urgence…), entre startsAt et endsAt.
 */
@Entity('work_schedule_exceptions')
@Index('idx_work_schedule_exc_user', ['userId', 'companyId', 'endsAt'])
@Index('idx_work_schedule_exc_company', ['companyId', 'startsAt'])
export class WorkScheduleException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'datetime', precision: 6 })
  startsAt: Date;

  @Column({ type: 'datetime', precision: 6 })
  endsAt: Date;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  revokedAt?: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  revokedById?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  revokeReason?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
