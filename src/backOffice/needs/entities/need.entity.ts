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
  VersionColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import {
  NeedAction,
  NeedExecutionStatus,
  NeedFinanceStatus,
  NeedLevelStatus,
  NeedPriority,
  NeedStatus,
} from '../common/needs.enums';

/** ✅ Une validation donnée à un niveau */
export interface NeedLevelApproval {
  userId: string;
  at: string;
  comment: string | null;
  /** Montant proposé par ce validateur (sinon le montant demandé) */
  approvedAmount: number | null;
  /** Décision d'un administrateur hors de son tour / d'un remplaçant */
  asSubstitute?: boolean;
  override?: boolean;
}

/** ✅ État d'un niveau (copie de la règle au moment de la soumission) */
export interface NeedLevelState {
  level: number; // 1, 2, 3…
  name: string;
  /** Validateurs titulaires retenus */
  approverIds: string[];
  /** Remplaçants (peuvent décider ; prévenus si un titulaire est indisponible ou à l'escalade) */
  substituteIds: string[];
  approverRoles: string[];
  minApprovals: number;
  call: boolean;
  reminderMinutes: number;
  maxReminders: number;
  escalateToIds: string[];
  status: NeedLevelStatus;
  approvals: NeedLevelApproval[];
  decidedById: string | null;
  decision: string | null;
  comment: string | null;
  startedAt: string | null;
  completedAt: string | null;
  reminders: number;
  escalatedAt: string | null;
  skipReason?: string | null;
}

/** ✅ État de besoin */
@Entity('bo_need_requests')
@Index('uq_bo_need_ref', ['reference'], { unique: true })
@Index('idx_bo_need_company_status', ['companyId', 'status'])
@Index('idx_bo_need_requester', ['requesterId'])
@Index('idx_bo_need_department', ['departmentId'])
@Index('idx_bo_need_finance', ['companyId', 'financeStatus'])
export class NeedRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  /** EB-AAAAMMJJ-12345 (automatique) */
  @Column({ type: 'varchar', length: 40 })
  reference: string;

  // ---------- Demandeur ----------
  @Column({ type: 'varchar', length: 36 })
  requesterId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requesterId' })
  requester?: UserEntity;

  /** Copie (le nom peut changer ensuite) */
  @Column({ type: 'varchar', length: 150, nullable: true })
  requesterName?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  departmentId?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  departmentName?: string | null;

  // ---------- Besoin ----------
  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** MATERIAL, SUPPLIES, LOGISTICS, TRANSPORT, MAINTENANCE, COMMUNICATION, IT… */
  @Column({ type: 'varchar', length: 40 })
  category: string;

  @Column({ type: 'varchar', length: 15, default: NeedPriority.NORMAL })
  priority: NeedPriority;

  /** Motif et justification */
  @Column({ type: 'text', nullable: true })
  justification?: string | null;

  /** Date souhaitée */
  @Column({ type: 'date', nullable: true })
  neededBy?: string | null;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  /** Somme des articles (quantité × prix unitaire estimé) */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  estimatedTotal: number;

  /** Équivalent USD (seuils des règles, statistiques) */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  estimatedTotalUsd?: number | null;

  // ---------- Circuit ----------
  @Column({ type: 'varchar', length: 25, default: NeedStatus.DRAFT })
  status: NeedStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  ruleId?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  ruleName?: string | null;

  @Column({ type: 'json', nullable: true })
  levels?: NeedLevelState[] | null;

  /** Niveau en cours (0 = aucun) */
  @Column({ type: 'int', default: 0 })
  currentLevel: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  levelStartedAt?: Date | null;

  @Column({ type: 'tinyint', default: 0 })
  allowSelfApproval: boolean;

  /** Montant approuvé par les validateurs (≤ estimé) ; vide = montant estimé */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  approvedAmount?: number | null;

  @Column({ type: 'int', default: 0 })
  submissions: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  submittedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  firstSubmittedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  validatedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  rejectedAt?: Date | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  rejectionReason?: string | null;

  /** Niveau qui a demandé la correction + message */
  @Column({ type: 'int', nullable: true })
  correctionLevel?: number | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  correctionMessage?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cancelReason?: string | null;

  // ---------- Finance (≠ validation) ----------
  @Column({ type: 'varchar', length: 20, default: NeedFinanceStatus.NONE })
  financeStatus: NeedFinanceStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  transmittedAt?: Date | null;

  /** Montant effectivement autorisé au décaissement */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  authorizedAmount?: number | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  authorizedById?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  authorizedAt?: Date | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  authorizationNote?: string | null;

  /** Total décaissé (somme des décaissements) */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  disbursedTotal: number;

  @Column({ type: 'date', nullable: true })
  lastDisbursedAt?: string | null;

  // ---------- Exécution (≠ paiement) ----------
  @Column({ type: 'varchar', length: 15, default: NeedExecutionStatus.NOT_STARTED })
  executionStatus: NeedExecutionStatus;

  /** 0 à 100 */
  @Column({ type: 'int', default: 0 })
  executionRate: number;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  executionNote?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  executedAt?: Date | null;

  @OneToMany(() => NeedItem, (i) => i.need)
  items?: NeedItem[];

  @OneToMany(() => NeedAttachment, (a) => a.need)
  attachments?: NeedAttachment[];

  @OneToMany(() => NeedDisbursement, (d) => d.need)
  disbursements?: NeedDisbursement[];

  /** Modifications simultanées : la version est contrôlée à chaque modification */
  @VersionColumn({ default: 1 })
  version: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}

/** ✅ Article ou service demandé */
@Entity('bo_need_items')
@Index('idx_bo_need_items_need', ['needId', 'position'])
export class NeedItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  needId: string;

  @ManyToOne(() => NeedRequest, (n) => n.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'needId' })
  need?: NeedRequest;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ type: 'varchar', length: 255 })
  designation: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description?: string | null;

  /** pièce, carton, litre, jour, forfait… */
  @Column({ type: 'varchar', length: 30, nullable: true })
  unit?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalNumber })
  quantity: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  total: number;

  /** Quantité réellement exécutée / livrée */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimalNumber })
  executedQuantity: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}

/** ✅ Pièce jointe (devis, justificatif, preuve de paiement, preuve d'exécution) */
@Entity('bo_need_attachments')
@Index('idx_bo_need_att_need', ['needId'])
export class NeedAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  needId: string;

  @ManyToOne(() => NeedRequest, (n) => n.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'needId' })
  need?: NeedRequest;

  /** QUOTE, JUSTIFICATION, PAYMENT_PROOF, EXECUTION_PROOF, OTHER */
  @Column({ type: 'varchar', length: 20, default: 'OTHER' })
  kind: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mimeType?: string | null;

  @Column({ type: 'int', nullable: true })
  size?: number | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  disbursementId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  uploadedById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}

/** ✅ Décaissement (paiement) — plusieurs possibles (paiement partiel) */
@Entity('bo_need_disbursements')
@Index('idx_bo_need_disb_need', ['needId'])
export class NeedDisbursement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  needId: string;

  @ManyToOne(() => NeedRequest, (n) => n.disbursements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'needId' })
  need?: NeedRequest;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  amount: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  /** Date du décaissement */
  @Column({ type: 'date' })
  paidAt: string;

  /** Personne qui a effectué le paiement (caissier…) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  paidById?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  paidByName?: string | null;

  /** Bénéficiaire (fournisseur, agent…) */
  @Column({ type: 'varchar', length: 150, nullable: true })
  beneficiary?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentMethod?: string | null;

  /** N° de pièce, de chèque, de transaction */
  @Column({ type: 'varchar', length: 100, nullable: true })
  paymentReference?: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note?: string | null;

  /** Mouvement de trésorerie créé (sortie de caisse), si un compte a été choisi */
  @Column({ type: 'varchar', length: 36, nullable: true })
  cashTransactionId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  cashAccountId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  recordedById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}

/** ✅ Historique (audit) : on n'y fait QUE des ajouts — aucune route ne modifie ni ne supprime */
@Entity('bo_need_logs')
@Index('idx_bo_need_logs_need', ['needId', 'createdAt'])
@Index('idx_bo_need_logs_user', ['userId'])
export class NeedLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  needId: string;

  @Column({ type: 'varchar', length: 30 })
  action: NeedAction;

  /** Niveau de validation concerné (0 = hors circuit) */
  @Column({ type: 'int', default: 0 })
  level: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  userId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL', createForeignKeyConstraints: false })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity | null;

  /** Copie du nom au moment de l'action */
  @Column({ type: 'varchar', length: 150, nullable: true })
  userName?: string | null;

  @Column({ type: 'varchar', length: 25, nullable: true })
  fromStatus?: string | null;

  @Column({ type: 'varchar', length: 25, nullable: true })
  toStatus?: string | null;

  @Column({ type: 'text', nullable: true })
  comment?: string | null;

  /** Détails : modifications (avant / après), destinataires des notifications, montants… */
  @Column({ type: 'json', nullable: true })
  payload?: Record<string, any> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
