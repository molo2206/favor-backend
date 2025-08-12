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
import { RentalContract } from 'src/rental-contract/entities/rental-contract.entity';
import { SaleTransaction } from 'src/sale-transaction/entities/sale-transaction.entity';

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

  // Prix originaux
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  detail_price_original?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  gros_price_original?: number;

  // Prix actuels
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  detail?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  gros?: number;

  @Column()
  type: string;

  // Champs spécifiques aux cars
  @Column({ nullable: true })
  registrationNumber?: string;

  @Column({ nullable: true })
  brand: string;

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

  //fin car
  @Column({ nullable: true })
  ingredients?: string;

  @Column({ type: 'int', default: 0 })
  quantity: number;

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

  @OneToMany(() => RentalContract, (contract) => contract.vehicle)
  rentalContracts: RentalContract[];

  @OneToMany(() => SaleTransaction, (sale) => sale.vehicle)
  saleTransactions: SaleTransaction[];
}
