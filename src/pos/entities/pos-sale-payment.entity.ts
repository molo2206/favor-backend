import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { decimalNumber } from 'src/classifieds/entities/decimal.transformer';
import { PosPaymentMethod, PosSaleSource } from '../enums/pos.enum';

/**
 * Un règlement rattaché à une vente. Une vente peut en avoir plusieurs
 * (paiement multiple, acompte puis solde, règlement d'un crédit plus tard).
 */
@Entity('pos_sale_payments')
@Unique('uq_pos_payment_client_op', ['saleId', 'clientOpId'])
@Index('idx_pos_payment_sale', ['saleId'])
@Index('idx_pos_payment_company', ['companyId', 'createdAt'])
export class PosSalePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  saleId: string;

  @Column({ type: 'enum', enum: PosPaymentMethod, default: PosPaymentMethod.CASH })
  method: PosPaymentMethod;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  amount: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  paidById?: string | null;

  @Column({ type: 'enum', enum: PosSaleSource, default: PosSaleSource.ONLINE })
  source: PosSaleSource;

  /** Idempotence offline d'un règlement */
  @Column({ type: 'varchar', length: 80, nullable: true })
  clientOpId?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
