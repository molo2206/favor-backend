// src/company/entities/company-transaction.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import {
  CompanyEntity,
  FeeBasis,
  FeeType,
} from 'src/company/entities/company.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';

export enum TransactionType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('company_transactions')
export class CompanyTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Société concernée
  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  // Montant (positif)
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  // Type : DEBIT (sortie d'argent) ou CREDIT (entrée)
  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  // Statut de la transaction
  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  // Description / motif
  @Column({ type: 'text', nullable: true })
  description: string;

  // Référence externe générique (peut stocker un ID ou un numéro)
  @Column({ type: 'varchar', length: 36, nullable: true })
  referenceId: string;

  // Type de référence générique (ex: 'SHIPMENT', 'LTA', 'ORDER', 'MONTHLY_FEE')
  @Column({ type: 'varchar', length: 50, nullable: true })
  referenceType: string;

  // Période pour les frais récurrents (ex: '2025-04')
  @Column({ type: 'varchar', length: 7, nullable: true })
  period: string;

  // Base de calcul (copiée depuis la société au moment de la transaction)
  @Column({
    type: 'enum',
    enum: FeeBasis,
    nullable: true,
  })
  feeBasis: FeeBasis;

  // Type de frais (FIXED / PERCENT)
  @Column({
    type: 'enum',
    enum: FeeType,
    nullable: true,
  })
  feeType: FeeType;

  // Métadonnées additionnelles (ex: détails du calcul)
  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  paid: boolean;

  // --- Relations spécifiques ---
  // Lien vers un envoi (shipment)
  @Column({ type: 'varchar', length: 36, nullable: true })
  shipmentId: string;

  @ManyToOne(() => Shipment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shipmentId' })
  shipment: Shipment;

  // Lien vers une LTA
  @Column({ type: 'varchar', length: 36, nullable: true })
  ltaId: string;

  @ManyToOne(() => LtaEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ltaId' })
  lta: LtaEntity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
