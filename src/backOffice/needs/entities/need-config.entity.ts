import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { NeedMemberRole } from '../common/needs.enums';

/** ✅ Un niveau configuré du circuit */
export interface NeedLevelConfig {
  /** « Chef de service », « Chargé de programme », « RAF », « Direction générale »… */
  name: string;
  /** Validateurs nommés */
  approverIds?: string[];
  /** Validateurs par rôle : DEPARTMENT_MANAGER, PARENT_DEPARTMENT_MANAGER, FINANCE, OWNER, NEED_ADMIN */
  approverRoles?: string[];
  /** Remplaçants en cas d'indisponibilité */
  substituteIds?: string[];
  /** Nombre de validations nécessaires à ce niveau (1 = le premier qui approuve) */
  minApprovals?: number;
  /** Ce niveau ne s'applique qu'à partir de ce montant (devise de la règle) : validation supplémentaire */
  minAmount?: number | null;
  /** Faire sonner les validateurs (appel), défaut : oui */
  call?: boolean;
  /** Relance après N minutes sans réponse (défaut NEEDS_REMINDER_MINUTES) */
  reminderMinutes?: number;
  /** Nombre de relances avant escalade (défaut NEEDS_MAX_REMINDERS) */
  maxReminders?: number;
  /** Prévenus si le niveau reste sans réponse après les relances (défaut : remplaçants puis direction) */
  escalateToIds?: string[];
}

/**
 * ✅ Circuit de validation : quelles demandes (départements, catégories, priorités, montants)
 * et par quels niveaux, dans quel ordre. La règle retenue : la plus prioritaire, puis le seuil le plus haut.
 */
@Entity('bo_need_rules')
@Index('idx_bo_need_rules_company', ['companyId', 'isActive'])
export class NeedRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  /** Départements concernés (vide = tous) */
  @Column({ type: 'json', nullable: true })
  departmentIds?: string[] | null;

  /** Catégories concernées (vide = toutes) */
  @Column({ type: 'json', nullable: true })
  categories?: string[] | null;

  /** Priorités concernées (vide = toutes) */
  @Column({ type: 'json', nullable: true })
  priorities?: string[] | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  minAmount: number;

  /** Exclu ; vide = sans limite */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  maxAmount?: number | null;

  /** Devise des seuils (les autres devises sont converties : exchange_rates) */
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'json' })
  levels: NeedLevelConfig[];

  /** Le demandeur peut valider un niveau dont il fait partie (sinon il en est exclu) */
  @Column({ type: 'tinyint', default: 0 })
  allowSelfApproval: boolean;

  /** Délai cible de validation par niveau (heures) — indicateur « en retard » */
  @Column({ type: 'int', nullable: true })
  slaHours?: number | null;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'tinyint', default: 1 })
  isActive: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}

/** ✅ Rôles dans le module + indisponibilité (remplaçant) */
@Entity('bo_need_members')
@Index('uq_bo_need_member', ['companyId', 'userId'], { unique: true })
export class NeedMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  /** ADMIN, FINANCE, VIEWER ; vide = simple validateur (indisponibilité seulement) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  role?: NeedMemberRole | null;

  /** Indisponible (congé, mission) : ses demandes vont à son remplaçant */
  @Column({ type: 'datetime', nullable: true })
  unavailableFrom?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  unavailableUntil?: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  delegateId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
