import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from 'src/products/entities/product.entity';
import { TechnicalControlStatus } from '../enums/technical-control.enum';

/**
 * ✅ Fiche de contrôle technique d'un véhicule (produit CAR).
 *  - Associée au véhicule concerné (productId).
 *  - Conserve un instantané de l'identité du véhicule (figé même si le produit change ensuite).
 *  - Historique : un renouvellement crée une NOUVELLE fiche reliée à la précédente (previousControlId),
 *    sans supprimer les anciennes.
 *  - Un véhicule n'est louable aux organisations que s'il possède une fiche VALIDATED non expirée.
 */
@Entity('vehicle_technical_controls')
@Index('idx_tc_product', ['productId'])
@Index('idx_tc_status', ['status'])
@Index('idx_tc_expiry', ['expiryDate'])
export class VehicleTechnicalControl {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Référence lisible du contrôle (unique) */
  @Index('uq_tc_reference', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  reference: string;

  // ---- Véhicule concerné ----
  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productId' })
  product?: Product | null;

  // ---- Instantané d'identification du véhicule (figé) ----
  @Column({ type: 'varchar', length: 100, nullable: true })
  vehicleRegistrationNumber?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  vehicleModel?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  vehicleYear?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  vehicleBrand?: string | null;

  /** Propriétaire du véhicule (users.id) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  ownerId?: string | null;

  // ---- Contrôle ----
  @Column({ type: 'datetime', precision: 6, nullable: true })
  controlDate?: Date | null;

  /** Agent / administrateur ayant effectué la vérification (users.id) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  agentId?: string | null;

  /** État général du véhicule */
  @Column({ type: 'varchar', length: 255, nullable: true })
  generalState?: string | null;

  /** Résultats des vérifications techniques (checklist libre) */
  @Column({ type: 'json', nullable: true })
  results?: any;

  /** Observations et anomalies constatées */
  @Column({ type: 'text', nullable: true })
  observations?: string | null;

  /** Documents ou photos justificatifs (URLs) */
  @Column({ type: 'json', nullable: true })
  documents?: any;

  /** Date d'expiration / prochaine échéance */
  @Column({ type: 'date', nullable: true })
  expiryDate?: string | null;

  @Column({
    type: 'enum',
    enum: TechnicalControlStatus,
    default: TechnicalControlStatus.PENDING_PAYMENT,
  })
  status: TechnicalControlStatus;

  /** Montant effectivement payé pour CE contrôle (figé, indépendant des tarifs futurs) */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amountPaid?: number | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency?: string | null;

  /** Fiche précédente en cas de renouvellement (historique) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  previousControlId?: string | null;

  /** Dérogation admin tracée : contrôle validé sans paiement confirmé (exception) */
  @Column({ type: 'tinyint', default: 0 })
  paymentWaived: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paymentWaivedReason?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
