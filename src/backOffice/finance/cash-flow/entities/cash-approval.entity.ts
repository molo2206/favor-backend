import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { CashApprovalAction, CashApprovalLevelStatus, CashApprovalStatus, CashApprovalTarget, CashDirection } from '../common/cash-flow.enums';

/** ✅ État d'un niveau dans une demande (copie de la règle au moment de la demande) */
export interface CashApprovalLevelState {
  level: number; // 1, 2, 3…
  name: string;
  minApprovals: number;
  call: boolean;
  reminderMinutes: number;
  escalateToIds: string[];
  /** Validateurs retenus (calculés quand le niveau commence) */
  approverIds: string[];
  /** Configuration d'origine (rôles / personnes) */
  approverRoles: string[];
  configuredApproverIds: string[];
  status: CashApprovalLevelStatus;
  approvedBy: string[];
  startedAt: string | null;
  completedAt: string | null;
  reminders: number;
  escalatedAt: string | null;
}

/** ✅ Demande de validation d'un mouvement ou d'un transfert (circuit à plusieurs niveaux) */
@Entity('bo_cash_approvals')
@Index('idx_bo_ca_company_status', ['companyId', 'status'])
@Index('idx_bo_ca_target', ['targetType', 'targetId'])
@Index('idx_bo_ca_requester', ['requestedById'])
export class CashApproval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 12 })
  targetType: CashApprovalTarget;

  @Column({ type: 'varchar', length: 36 })
  targetId: string;

  /** Référence de l'opération (DEC-…, ENC-…, TRF-…) */
  @Column({ type: 'varchar', length: 40 })
  reference: string;

  @Column({ type: 'varchar', length: 3, nullable: true })
  direction?: CashDirection | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  amount: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  /** Équivalent USD (pour les seuils et les statistiques) */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  amountUsd?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  summary?: string | null;

  /** Règle appliquée (vide = validation simple par les responsables financiers) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  ruleId?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  ruleName?: string | null;

  @Column({ type: 'tinyint', default: 0 })
  allowSelfApproval: boolean;

  @Column({ type: 'json' })
  levels: CashApprovalLevelState[];

  /** Niveau en cours (1…n) ; 0 = terminé */
  @Column({ type: 'int', default: 1 })
  currentLevel: number;

  /** Validateurs du niveau en cours (recherche « à valider par moi ») */
  @Column({ type: 'json', nullable: true })
  currentApproverIds?: string[] | null;

  @Column({ type: 'varchar', length: 12, default: CashApprovalStatus.PENDING })
  status: CashApprovalStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  requestedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requestedById' })
  requestedBy?: UserEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  decidedById?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  decisionReason?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  levelStartedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastNotifiedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  completedAt?: Date | null;

  @OneToMany(() => CashApprovalStep, (s) => s.approval)
  steps?: CashApprovalStep[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}

/** ✅ Historique d'une demande (qui a fait quoi, à quel niveau) */
@Entity('bo_cash_approval_steps')
@Index('idx_bo_cas_approval', ['approvalId', 'createdAt'])
export class CashApprovalStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  approvalId: string;

  @ManyToOne(() => CashApproval, (a) => a.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'approvalId' })
  approval?: CashApproval;

  @Column({ type: 'int', default: 0 })
  level: number;

  @Column({ type: 'varchar', length: 20 })
  action: CashApprovalAction;

  @Column({ type: 'varchar', length: 36, nullable: true })
  userId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment?: string | null;

  @Column({ type: 'json', nullable: true })
  payload?: Record<string, any> | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
