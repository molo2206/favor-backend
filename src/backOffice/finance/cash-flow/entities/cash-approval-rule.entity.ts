import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { CashApprovalScope, CashApproverRole } from '../common/cash-flow.enums';

/** ✅ Un niveau du circuit de validation */
export interface CashApprovalLevelConfig {
  /** Nom affiché : « Chef de service », « Directeur financier », « Directeur général »… */
  name: string;
  /** Validateurs nommés */
  approverIds?: string[];
  /** Validateurs par rôle : OWNER (propriétaires de l'entreprise), MANAGER (responsables financiers) */
  approverRoles?: CashApproverRole[];
  /** Nombre de validations nécessaires à ce niveau (1 = le premier qui valide) */
  minApprovals?: number;
  /** Appeler (faire sonner) les validateurs de ce niveau (défaut : oui) */
  call?: boolean;
  /** Relance si pas de réponse après N minutes (défaut CASH_FLOW_REMINDER_MINUTES) */
  reminderMinutes?: number;
  /** Prévenus si le niveau reste sans réponse après toutes les relances */
  escalateToIds?: string[];
}

/**
 * ✅ Règle de validation : quelles opérations, à partir de quel montant, et par quels niveaux elles passent.
 * Exemple : sorties ≥ 1 000 USD → 1) Responsable financier, 2) Directeur général.
 * La règle qui s'applique : la plus prioritaire, puis le seuil le plus élevé.
 */
@Entity('bo_cash_approval_rules')
@Index('idx_bo_car_company', ['companyId', 'isActive'])
export class CashApprovalRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 10, default: CashApprovalScope.OUT })
  scope: CashApprovalScope;

  /** Seuil minimum (inclus), dans `currency` */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  minAmount: number;

  /** Seuil maximum (exclu) ; vide = sans limite */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  maxAmount?: number | null;

  /** Devise des seuils (les montants des autres devises sont convertis : exchange_rates) */
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  /** Limiter à des rubriques / à des comptes (vide = toutes / tous) */
  @Column({ type: 'json', nullable: true })
  categoryIds?: string[] | null;

  @Column({ type: 'json', nullable: true })
  accountIds?: string[] | null;

  /** Niveaux, dans l'ordre */
  @Column({ type: 'json' })
  levels: CashApprovalLevelConfig[];

  /** La règle s'applique aussi aux opérations saisies par les responsables financiers */
  @Column({ type: 'tinyint', default: 1 })
  applyToManagers: boolean;

  /** Le demandeur peut valider un niveau dont il fait partie (sinon il est exclu de ce niveau) */
  @Column({ type: 'tinyint', default: 0 })
  allowSelfApproval: boolean;

  /** Plus grand = prioritaire */
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
