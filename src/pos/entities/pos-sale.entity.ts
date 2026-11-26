import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { decimalNumber } from 'src/classifieds/entities/decimal.transformer';
import { PosPaymentMethod, PosPaymentStatus, PosSaleSource, PosSaleStatus } from '../enums/pos.enum';
import { PosSaleItem } from './pos-sale-item.entity';
import { PosSalePayment } from './pos-sale-payment.entity';

/**
 * Vente en caisse (ticket). Distincte des commandes en ligne (`order`).
 * `clientOpId` : identifiant généré par la caisse (idempotence de la synchro offline).
 */
@Entity('pos_sales')
@Unique('uq_pos_sale_client_op', ['terminalId', 'clientOpId'])
@Index('idx_pos_sale_company', ['companyId', 'createdAt'])
@Index('idx_pos_sale_session', ['sessionId'])
export class PosSale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  terminalId: string;

  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  /** Numéro de ticket (lisible) */
  @Column({ type: 'varchar', length: 40 })
  number: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  customerId?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  customerName?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  customerPhone?: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  subtotal: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  discount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  tax: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  total: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: PosPaymentMethod, default: PosPaymentMethod.CASH })
  paymentMethod: PosPaymentMethod;

  @Column({ type: 'enum', enum: PosSaleStatus, default: PosSaleStatus.PAID })
  status: PosSaleStatus;

  /** Montant déjà réglé */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  amountPaid: number;

  /** Reste dû (total - réglé) */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  amountDue: number;

  /** État de règlement : PAID | PARTIAL | CREDIT | UNPAID */
  @Column({ type: 'enum', enum: PosPaymentStatus, default: PosPaymentStatus.PAID })
  paymentStatus: PosPaymentStatus;

  @Column({ type: 'enum', enum: PosSaleSource, default: PosSaleSource.ONLINE })
  source: PosSaleSource;

  /** Vente présentant une ordonnance (pharmacie) */
  @Column({ type: 'tinyint', width: 1, default: 0 })
  hasPrescription: boolean;

  /** Idempotence offline : identifiant unique généré par la caisse */
  @Column({ type: 'varchar', length: 80, nullable: true })
  clientOpId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  cashierId?: string | null;

  /** Horodatage réel de la vente (sur la caisse, peut différer de la réception serveur) */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  soldAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => PosSaleItem, (i) => i.sale, { cascade: true })
  items: PosSaleItem[];

  /** Règlements rattachés (chargés séparément via saleId ; voir PosService) */
  payments?: PosSalePayment[];
}
