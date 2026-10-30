import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { ClassifiedReportReason, ClassifiedReportStatus } from '../enums/classified.enums';
import { Product } from 'src/products/entities/product.entity';

/** Signalement d'une annonce (arnaque, produit interdit…) */
@Entity('classified_reports')
@Index('idx_classified_report_status', ['status', 'createdAt'])
@Index('idx_classified_report_product', ['productId'])
export class ClassifiedReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Annonce = ligne de la table `products` (listingType = CLASSIFIED) */
  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reporterId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reporterId' })
  reporter?: UserEntity | null;

  @Column({ type: 'enum', enum: ClassifiedReportReason })
  reason: ClassifiedReportReason;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  message?: string | null;

  @Column({ type: 'enum', enum: ClassifiedReportStatus, default: ClassifiedReportStatus.OPEN })
  status: ClassifiedReportStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  handledById?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  resolution?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
