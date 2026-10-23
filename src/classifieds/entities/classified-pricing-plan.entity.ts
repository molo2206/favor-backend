import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { City } from 'src/company/entities/city.entity';
import { Country } from 'src/company/entities/country.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { decimalNumber } from './decimal.transformer';

/**
 * Tarif de publication d'une annonce — dynamique par ville (et éventuellement par catégorie).
 *
 * Plusieurs lignes peuvent porter le même `code` (ex. STANDARD_7J) :
 * la plus précise s'applique pour une annonce donnée :
 *   ville + catégorie  >  ville  >  pays + catégorie  >  pays  >  catégorie  >  tarif général.
 * Ex. STANDARD_7J = 2 USD partout, 3 USD à Kinshasa, 1 USD à Bukavu.
 */
@Entity('classified_pricing_plans')
@Index('idx_classified_plan_code', ['code', 'isActive'])
@Index('idx_classified_plan_city', ['cityId', 'isActive'])
export class ClassifiedPricingPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Code commun du forfait (ex. STANDARD_7J, TOP_30J) */
  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  /** null = toutes les villes */
  @Column({ type: 'varchar', length: 36, nullable: true })
  cityId?: string | null;

  @ManyToOne(() => City, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cityId' })
  city?: City | null;

  /** null = tous les pays (utile si la ville n'a pas de tarif propre) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  countryId?: string | null;

  @ManyToOne(() => Country, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'countryId' })
  country?: Country | null;

  /** null = toutes les catégories */
  @Column({ type: 'varchar', length: 36, nullable: true })
  categoryId?: string | null;

  @ManyToOne(() => CategoryEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category?: CategoryEntity | null;

  /** Durée de mise en ligne (jours) */
  @Column({ type: 'int', default: 30 })
  durationDays: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  price: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  /** Annonce mise en avant (en tête des résultats) pendant la durée */
  @Column({ default: false })
  isFeatured: boolean;

  /** Nombre maximum de photos */
  @Column({ type: 'int', default: 10 })
  maxImages: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
