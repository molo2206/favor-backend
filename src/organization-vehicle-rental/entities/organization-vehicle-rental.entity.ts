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
import { OrganizationRentalStatus } from '../enums/organization-rental.enum';

/**
 * ✅ Réservation DÉDIÉE d'un véhicule de location pour une ORGANISATION.
 *  - Séparée du flux commande classique (location privée inchangée).
 *  - Montant = nombre de jours × dailyRate (figé à la création).
 *  - Paiement APRÈS prestation (voir organization_rental_payments).
 *  - Bénéficiaire du paiement = propriétaire du véhicule (ownerId).
 *  - Responsabilités figées (entretien/chauffeur = propriétaire ; carburant = client).
 */
@Entity('organization_vehicle_rentals')
@Index('idx_ovr_product', ['productId'])
@Index('idx_ovr_status', ['status'])
@Index('idx_ovr_client', ['clientId'])
@Index('idx_ovr_owner', ['ownerId'])
export class OrganizationVehicleRental {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_ovr_reference', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  reference: string;

  // ---- Véhicule ----
  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productId' })
  product?: Product | null;

  /** Propriétaire du véhicule = bénéficiaire du paiement */
  @Column({ type: 'varchar', length: 36, nullable: true })
  ownerId?: string | null;

  // ---- Organisation locataire ----
  @Column({ type: 'varchar', length: 36, nullable: true })
  clientId?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  organizationName?: string | null;

  // ---- Période & montant ----
  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'int', default: 1 })
  days: number;

  /** Tarif journalier appliqué (instantané du dailyRate du véhicule) */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  dailyRate: number;

  /** Montant total = days × dailyRate (figé) */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  /** Instantané des responsabilités (propriétaire : entretien + chauffeur ; client : carburant) */
  @Column({ type: 'json', nullable: true })
  responsibilities?: any;

  @Column({
    type: 'enum',
    enum: OrganizationRentalStatus,
    default: OrganizationRentalStatus.PENDING,
  })
  status: OrganizationRentalStatus;

  /** Mode de paiement choisi (FPAY / MOBILE_MONEY / CASH) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  paymentMethod?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
