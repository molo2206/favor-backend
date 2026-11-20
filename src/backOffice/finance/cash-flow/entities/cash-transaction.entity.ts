import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { CashDirection, CashTransactionStatus } from '../common/cash-flow.enums';
import { CashAccount } from './cash-account.entity';
import { CashCategory } from './cash-category.entity';

/**
 * ✅ Mouvement de trésorerie : entrée ou sortie d'argent sur un compte.
 * Seuls les mouvements VALIDATED comptent dans le solde.
 * Un transfert entre comptes = 2 mouvements liés (transferId) : sortie + entrée.
 */
@Entity('bo_cash_transactions')
@Index('idx_bo_cash_tx_company_date', ['companyId', 'transactionDate'])
@Index('idx_bo_cash_tx_account_status', ['accountId', 'status', 'transactionDate'])
@Index('idx_bo_cash_tx_category', ['categoryId'])
@Index('idx_bo_cash_tx_transfer', ['transferId'])
@Index('idx_bo_cash_tx_source', ['sourceType', 'sourceId'])
export class CashTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  reference: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @ManyToOne(() => CashAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account?: CashAccount;

  @Column({ type: 'varchar', length: 36, nullable: true })
  categoryId?: string | null;

  @ManyToOne(() => CashCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category?: CashCategory | null;

  @Column({ type: 'varchar', length: 3 })
  direction: CashDirection;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  amount: number;

  /** Devise du compte */
  @Column({ type: 'varchar', length: 10 })
  currency: string;

  /** Date de l'opération (AAAA-MM-JJ) */
  @Column({ type: 'date' })
  transactionDate: string;

  @Column({ type: 'varchar', length: 20, default: CashTransactionStatus.VALIDATED })
  status: CashTransactionStatus;

  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentMethod?: string | null;

  /** Client, fournisseur, employé… */
  @Column({ type: 'varchar', length: 150, nullable: true })
  counterpartyName?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  counterpartyPhone?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  /** N° de facture, de reçu, de chèque… */
  @Column({ type: 'varchar', length: 100, nullable: true })
  documentNumber?: string | null;

  /** Justificatif (photo du reçu, PDF) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  attachmentUrl?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  branchId?: string | null;

  /** Transfert interne (exclu des entrées / sorties des rapports) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  transferId?: string | null;

  /** Arrêté de caisse qui a créé ce mouvement (écart) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  closingId?: string | null;

  /** Lien facultatif vers un autre module (ORDER, SHIPMENT, PAYROLL, FUEL…) */
  @Column({ type: 'varchar', length: 40, nullable: true })
  sourceType?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sourceId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: UserEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  validatedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'validatedById' })
  validatedBy?: UserEntity | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  validatedAt?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  rejectionReason?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  cancelledById?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cancellationReason?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
