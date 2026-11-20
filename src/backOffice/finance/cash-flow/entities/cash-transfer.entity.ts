import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { CashTransactionStatus } from '../common/cash-flow.enums';
import { CashAccount } from './cash-account.entity';

/**
 * ✅ Transfert entre deux comptes (ex. caisse → banque, USD → CDF).
 * Crée une sortie sur le compte de départ et une entrée sur le compte d'arrivée (+ frais éventuels).
 */
@Entity('bo_cash_transfers')
@Index('idx_bo_cash_transfers_company', ['companyId', 'transferDate'])
export class CashTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  reference: string;

  @Column({ type: 'varchar', length: 36 })
  fromAccountId: string;

  @ManyToOne(() => CashAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromAccountId' })
  fromAccount?: CashAccount;

  @Column({ type: 'varchar', length: 36 })
  toAccountId: string;

  @ManyToOne(() => CashAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toAccountId' })
  toAccount?: CashAccount;

  /** Montant sorti (devise du compte de départ) */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  amount: number;

  @Column({ type: 'varchar', length: 10 })
  fromCurrency: string;

  @Column({ type: 'varchar', length: 10 })
  toCurrency: string;

  /** 1 unité de la devise de départ = exchangeRate unités de la devise d'arrivée */
  @Column({ type: 'decimal', precision: 18, scale: 6, default: 1, transformer: decimalNumber })
  exchangeRate: number;

  /** Montant reçu (devise du compte d'arrivée) */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  receivedAmount: number;

  /** Frais (devise du compte de départ), sortie séparée « Frais de transfert » */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  fees: number;

  @Column({ type: 'date' })
  transferDate: string;

  @Column({ type: 'varchar', length: 20, default: CashTransactionStatus.VALIDATED })
  status: CashTransactionStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
