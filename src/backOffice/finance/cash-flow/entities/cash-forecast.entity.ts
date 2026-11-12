import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { CashCategory } from './cash-category.entity';

/**
 * ✅ Prévision (budget) d'une rubrique pour un mois : comparée au réel et utilisée
 * pour projeter le solde des mois à venir.
 */
@Entity('bo_cash_forecasts')
@Unique('uq_bo_cash_forecast', ['companyId', 'categoryId', 'period', 'currency'])
@Index('idx_bo_cash_forecast_period', ['companyId', 'period'])
export class CashForecast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  categoryId: string;

  @ManyToOne(() => CashCategory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category?: CashCategory;

  /** Mois AAAA-MM */
  @Column({ type: 'varchar', length: 7 })
  period: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
