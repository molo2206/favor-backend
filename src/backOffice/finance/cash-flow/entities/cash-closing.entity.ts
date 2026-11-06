import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { CashAccount } from './cash-account.entity';

/**
 * ✅ Arrêté de caisse : comptage réel comparé au solde théorique à une date.
 * L'écart peut être régularisé (mouvement « Écart de caisse »).
 * Après un arrêté, les mouvements de ce compte datés de ce jour ou avant ne peuvent plus être modifiés.
 */
@Entity('bo_cash_closings')
@Index('idx_bo_cash_closings_account', ['accountId', 'closingDate'])
export class CashClosing {
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

  @Column({ type: 'date' })
  closingDate: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  /** Solde théorique (calculé) */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  expectedBalance: number;

  /** Solde compté */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  countedBalance: number;

  /** Compté − théorique */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  difference: number;

  /** Billetage : [{ value: 20, count: 12 }] */
  @Column({ type: 'json', nullable: true })
  denominations?: { value: number; count: number }[] | null;

  /** Écart régularisé par un mouvement */
  @Column({ type: 'varchar', length: 36, nullable: true })
  adjustmentTransactionId?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  closedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'closedById' })
  closedBy?: UserEntity | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
