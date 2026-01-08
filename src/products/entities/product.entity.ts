import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToMany,
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

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  detail_price_original?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  gros_price_original?: number;

  // Prix actuels
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  detail?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
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
    default: Type_rental_both_sale_car.SALE,
  })
  typecar?: Type_rental_both_sale_car;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  dailyRate?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  salePrice?: number;

  @Column({ type: 'enum', enum: FuelType, default: FuelType.ESSENCE })
  fuelType?: FuelType;

  @Column({ type: 'enum', enum: Transmission, default: Transmission.AUTOMATIC })
  transmission?: Transmission;

  @Column({ nullable: true })
  color?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  dailyRate_price_original?: number;

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

  @ManyToOne(() => CompanyEntity, (company) => company.id, {
    nullable: false,
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
}
