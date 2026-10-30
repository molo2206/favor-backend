import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { MediaPaymentMethod } from '../media.enums';
import { MediaProject } from './media-project.entity';

/** Paiement (acompte, solde) d'un projet média */
@Entity('bo_media_payments')
@Index('idx_bo_media_payment_project', ['projectId'])
@Index('idx_bo_media_payment_company_date', ['companyId', 'paidAt'])
export class MediaPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  projectId: string;

  @ManyToOne(() => MediaProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: MediaProject;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: MediaPaymentMethod, default: MediaPaymentMethod.CASH })
  method: MediaPaymentMethod;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference?: string | null;

  @Column({ type: 'datetime', precision: 6 })
  paidAt: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  receivedById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
