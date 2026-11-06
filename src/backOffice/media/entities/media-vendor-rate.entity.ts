import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { MediaServiceCategory, MediaUnit, MediaVendorDomain } from '../media.enums';
import { MediaVendor } from './media-vendor.entity';

/**
 * ✅ Prestation proposée par un prestataire externe, avec son tarif.
 * Ex. « Couverture photo mariage » — 300 USD / jour ; « Affiche A3 » — 25 000 CDF / visuel.
 */
@Entity('bo_media_vendor_rates')
@Index('idx_bo_media_vendor_rate_vendor', ['vendorId', 'isActive'])
@Index('idx_bo_media_vendor_rate_company', ['companyId', 'domain', 'isActive'])
export class MediaVendorRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  vendorId: string;

  @ManyToOne(() => MediaVendor, (v) => v.rates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendorId' })
  vendor?: MediaVendor;

  /** Nom de la prestation */
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description?: string | null;

  /** Domaine concerné (facultatif, sinon celui du prestataire) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  domain?: MediaVendorDomain | null;

  /** Famille de prestation du module Média (facultatif) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  category?: MediaServiceCategory | null;

  /** Unité : HOUR, DAY, SESSION, PROJECT, ITEM, MONTH */
  @Column({ type: 'varchar', length: 20, default: MediaUnit.PROJECT })
  unit: MediaUnit;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalNumber })
  price: number;

  /** USD, CDF, EUR… */
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  /** Conditions propres à cette prestation (minimum de commande, frais de déplacement…) */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  conditions?: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
