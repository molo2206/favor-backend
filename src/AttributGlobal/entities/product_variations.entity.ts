import { ImageProductEntity } from 'src/products/entities/imageProduct.entity';
import { Product } from 'src/products/entities/product.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { VariationAttributeValue } from './variation_attribute_values.entity';

@Entity('product_variations')
export class ProductVariation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  sku: string;

  @Column()
  productId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  wholesalePrice: number;

  @Column('decimal', { precision: 10, scale: 2 })
  retailPrice: number;

  @Column({ default: 0 })
  stock: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  weight?: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  length?: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  width?: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  height?: number;

  @Column({ nullable: true })
  barcode?: string;

  @Column({ nullable: true })
  imageId?: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Product, (product) => product.variations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => ImageProductEntity, (image) => image.variations, { nullable: true })
  @JoinColumn({ name: 'imageId' })
  image?: ImageProductEntity;

  @OneToMany(() => VariationAttributeValue, (vav) => vav.variation, { cascade: true })
  attributeValues: VariationAttributeValue[];
}
