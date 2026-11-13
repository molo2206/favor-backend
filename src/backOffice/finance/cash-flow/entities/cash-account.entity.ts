import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { CashAccountType } from '../common/cash-flow.enums';

/**
 * ✅ Compte de trésorerie de l'entreprise : caisse, banque, Mobile Money, F-Pay…
 * Solde = solde d'ouverture + entrées validées − sorties validées (calculé, jamais saisi).
 */
@Entity('bo_cash_accounts')
@Index('idx_bo_cash_accounts_company', ['companyId', 'isActive'])
export class CashAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  /** Caisse d'une branche (facultatif) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  branchId?: string | null;

  @ManyToOne(() => BranchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch?: BranchEntity | null;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: CashAccountType.CASH })
  type: CashAccountType;

  /** Un compte = une devise (USD, CDF…) */
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  bankName?: string | null;

  /** N° de compte, numéro Mobile Money… */
  @Column({ type: 'varchar', length: 100, nullable: true })
  accountNumber?: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  openingBalance: number;

  /** Date du solde d'ouverture (AAAA-MM-JJ) */
  @Column({ type: 'date', nullable: true })
  openingDate?: string | null;

  /** Découvert autorisé (banque) ; une caisse ne peut jamais être négative si false */
  @Column({ default: false })
  allowNegative: boolean;

  /** Solde minimum souhaité : alerte sur le tableau de bord en dessous */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  minBalance?: number | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 20, nullable: true })
  color?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
