import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToMany,
  ValueTransformer,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { ImageProductEntity } from './imageProduct.entity';
import { Expose, Type } from 'class-transformer';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { MeasureEntity } from 'src/measure/entities/measure.entity';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { Type_rental_both_sale_car } from 'src/products/enum/type_rental_both_sale_car';
import { FuelType } from 'src/products/enum/fuelType_enum';
import { Transmission } from '../enum/transmission.enum';
import { ProductVariation } from 'src/AttributGlobal/entities/product_variations.entity';
import { ProductAttribute } from 'src/AttributGlobal/entities/product_attributes.entity';
import { Wishlist } from './wishlists.entity';
import { ProductSpecificationValue } from 'src/specification/entities/ProductSpecificationValue.entity';
import { Brand } from './brand.entity';
import { RoomAvailability } from 'src/HotelRoomAvailability/entity/RoomAvailability.entity';
import { Reservation } from 'src/HotelRoomAvailability/entity/Reservation.entity';
import { BedTypes } from '../enum/bedtypes.enum';
// ✅ AJOUT : annonces (type Jiji) dans la même table que les produits
import { ListingType } from '../enum/listing-type.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { City } from 'src/company/entities/city.entity';
import { ClassifiedCondition, ClassifiedStatus } from 'src/classifieds/enums/classified.enums';

/**
 * Transformateur pour convertir les decimal en number
 * Solution sans migration, compatible production
 */
const decimalToNumber: ValueTransformer = {
  to: (value: number): number => value,
  from: (value: string | number | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? parseFloat(value) : value;
  },
};

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  name: string;

  @Column({ type: 'varchar', nullable: true, length: 500 })
  slug?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber, // ✅ Ajouté
  })
  price: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber, // ✅ Ajouté
  })
  detail_price_original?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber, // ✅ Ajouté
  })
  gros_price_original?: number;

  // Prix actuels
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber, // ✅ Ajouté
  })
  detail?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber, // ✅ Ajouté
  })
  gros?: number;

  @Column({ nullable: true })
  type: string;

  // Champs spécifiques aux cars
  @Column({ nullable: true })
  registrationNumber?: string;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  year: string;

  @Column({
    type: 'enum',
    enum: Type_rental_both_sale_car,
    nullable: true,
    default: null,
  })
  typecar?: Type_rental_both_sale_car | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber, // ✅ Ajouté
  })
  dailyRate?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber, // ✅ Ajouté
  })
  salePrice?: number;

  @Column({ type: 'enum', enum: FuelType, default: FuelType.ESSENCE })
  fuelType?: FuelType;

  @Column({ type: 'enum', enum: Transmission, default: Transmission.AUTOMATIC })
  transmission?: Transmission;

  @Column({ nullable: true })
  color?: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber, // ✅ Ajouté
  })
  dailyRate_price_original?: number;

  // ============================================================
  // ✅ TARIFS PAR DURÉE
  // ============================================================
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber,
  })
  halfDayRate?: number;      // Prix pour une demi-journée

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber,
  })
  hourlyRate?: number;       // Prix à l'heure

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber,
  })
  weeklyRate?: number;       // Prix pour une semaine

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber,
  })
  monthlyRate?: number;      // Prix pour un mois

  // ============================================================
  // ✅ TARIFS SPÉCIFIQUES PAR LOCALISATION
  // ============================================================
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber,
  })
  interiorCityRate?: number;    // Tarif pour intérieur ville

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber,
  })
  exteriorCityRate?: number;    // Tarif pour extérieur ville

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber,
  })
  pricePerKmExterior?: number;  // Prix au km hors ville

  // ============================================================
  // ✅ TARIF ÉVÉNEMENTIEL
  // ============================================================
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalToNumber,
  })
  eventRate?: number;           // Tarif de base événementiel

  // ============================================================
  // ✅ CARACTÉRISTIQUES
  // ============================================================
  @Column({
    type: 'int',
    default: 4,
  })
  seats: number;                 // Nombre de places

  @Column({
    type: 'int',
    default: 4,
  })
  doors: number;                 // Nombre de portes

  @Column({
    type: 'boolean',
    default: false,
  })
  airConditioning: boolean;      // Climatisation

  //fin car
  @Column({ nullable: true })
  ingredients?: string;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ type: 'int', default: 0 })
  min_quantity: number;

  @Column({ type: 'int', default: 0 })
  stockAlert: number;

  @Column({ nullable: true })
  image?: string;

  // ✅ MODIFIÉ : nullable — une annonce (listingType = CLASSIFIED) n'a pas d'entreprise
  @ManyToOne(() => CompanyEntity, (company) => company.id, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  company: CompanyEntity;

  @ManyToOne(() => CategoryEntity, (category) => category.products, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;

  @ManyToOne(() => Brand, (brand) => brand.products, { nullable: true })
  @JoinColumn({ name: 'brand_id' })
  brand?: Brand;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Expose()
  @OneToMany(() => ImageProductEntity, (image) => image.product, { cascade: true })
  @Type(() => ImageProductEntity)
  images: ImageProductEntity[];

  // Utilisation du ProductStatus au lieu du CompanyStatus
  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.PENDING })
  status: ProductStatus;

  @ManyToOne(() => MeasureEntity, (measure) => measure.products, { nullable: true })
  measure?: MeasureEntity;

  @Column({
    type: 'enum',
    enum: CompanyActivity,
    default: CompanyActivity.RETAILER,
  })
  companyActivity: CompanyActivity;

  @OneToMany(() => ProductSpecificationValue, (pv) => pv.product, { cascade: true })
  specificationValues: ProductSpecificationValue[];

  @OneToMany(() => ProductAttribute, (pa) => pa.product, { cascade: true })
  productAttributes: ProductAttribute[];

  @OneToMany(() => ProductVariation, (pv) => pv.product)
  variations: ProductVariation[];

  @OneToMany(() => ProductAttribute, (pa) => pa.product)
  attributes: ProductAttribute[];

  @OneToMany(() => Wishlist, (wishlist) => wishlist.product)
  wishlist: Wishlist[];

  @Column({ nullable: true })
  localization: string;

  @Column({ type: 'int', default: 0 })
  capacityAdults: number;

  @Column({ type: 'int', default: 0 })
  capacityChildren: number;

  @Column({ type: 'int', default: 0 })
  capacityTotal: number;

  @Column({
    type: 'enum',
    enum: BedTypes,
    default: BedTypes.DOUBLE,
  })
  bedTypes: BedTypes;

  @OneToMany(() => RoomAvailability, (availability) => availability.product)
  availability: RoomAvailability[];

  @OneToMany(() => Reservation, (reservation) => reservation.product)
  reservations: Reservation[];

  @Column({ type: 'varchar', length: 64, nullable: true })
  imageHash?: string;

  // src/products/entities/product.entity.ts
  @Column({ type: 'varchar', length: 64, nullable: true })
  imageHashPhash?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  imageHashDhash?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  imageHashAhash?: string;

  @Column({ type: 'text', nullable: true })
  imageColorHistogram?: string;   // JSON stringifié

  @Column({ type: 'text', nullable: true })
  imageOrbDescriptors?: string;   // JSON stringifié (optionnel)

  // ============================================================
  // ✅ AJOUT : ANNONCES (type Jiji) — même table que les produits
  //    listingType = PRODUCT  → produit d'entreprise (inchangé, colonnes ad* vides)
  //    listingType = CLASSIFIED → annonce d'un utilisateur, sans entreprise,
  //    mise en ligne payante selon le tarif de la ville (classified_pricing_plans)
  // ============================================================
  @Column({ type: 'enum', enum: ListingType, default: ListingType.PRODUCT })
  listingType: ListingType;

  /** Auteur de l'annonce (null pour un produit d'entreprise) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  ownerId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner?: UserEntity | null;

  /** Ville de l'annonce (fixe le tarif) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  adCityId?: string | null;

  @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'adCityId' })
  adCity?: City | null;

  /** Cycle de l'annonce (null pour un produit d'entreprise) */
  @Column({ type: 'enum', enum: ClassifiedStatus, nullable: true })
  adStatus?: ClassifiedStatus | null;

  @Column({ type: 'enum', enum: ClassifiedCondition, nullable: true })
  adCondition?: ClassifiedCondition | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  adCurrency?: string | null;

  @Column({ type: 'boolean', default: false })
  adNegotiable: boolean;

  @Column({ type: 'varchar', length: 30, nullable: true })
  adContactPhone?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  adWhatsapp?: string | null;

  @Column({ type: 'boolean', default: true })
  adShowPhone: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  adPlanId?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  adPlanCode?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  adPublishedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  adExpiresAt?: Date | null;

  /** En tête des résultats jusqu'à cette date */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  adFeaturedUntil?: Date | null;

  /** Durée payée en attente de modération (jours) */
  @Column({ type: 'int', nullable: true })
  adPendingDays?: number | null;

  @Column({ type: 'boolean', default: false })
  adPendingFeatured: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  adRejectionReason?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  adReviewedById?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  adReviewedAt?: Date | null;

  @Column({ type: 'boolean', default: false })
  adReminderSent: boolean;

  @Column({ type: 'int', default: 0 })
  adViews: number;

  @Column({ type: 'int', default: 0 })
  adContactClicks: number;

  /** Suppression par l'annonceur (l'historique des paiements reste) */
  @Column({ type: 'boolean', default: false })
  adDeleted: boolean;
}