import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { ClassifiedPaymentMethod, ClassifiedPaymentStatus } from '../enums/classified.enums';
import { Product } from 'src/products/entities/product.entity';
import { decimalNumber } from './decimal.transformer';

/** Paiement d'une publication / d'un renouvellement d'annonce */
@Entity('classified_payments')
@Index('idx_classified_payment_product', ['productId', 'createdAt'])
@Index('idx_classified_payment_status', ['status', 'createdAt'])
@Index('idx_classified_payment_city', ['cityId', 'paidAt'])
export class ClassifiedPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  reference: string;

  /** Annonce = ligne de la table `products` (listingType = CLASSIFIED) */
  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  planId?: string | null;

  /** Copie du forfait au moment du paiement (le tarif peut changer ensuite) */
  @Column({ type: 'json', nullable: true })
  planSnapshot?: Record<string, any> | null;

  /** Ville de l'annonce (rapports de recettes par ville) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  cityId?: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: ClassifiedPaymentMethod })
  method: ClassifiedPaymentMethod;

  @Column({ type: 'enum', enum: ClassifiedPaymentStatus, default: ClassifiedPaymentStatus.PENDING })
  status: ClassifiedPaymentStatus;

  /** Opérateur Mobile Money (VODACOM_MPESA_COD…) */
  @Column({ type: 'varchar', length: 60, nullable: true })
  provider?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone?: string | null;

  /** depositId Pawapay */
  @Column({ type: 'varchar', length: 100, nullable: true })
  externalId?: string | null;

  /** Transaction FPay */
  @Column({ type: 'varchar', length: 100, nullable: true })
  transactionId?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transactionReference?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  failureReason?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  paidAt?: Date | null;

  /** Le forfait a été appliqué à l'annonce (évite une double application) */
  @Column({ default: false })
  applied: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  validatedById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
