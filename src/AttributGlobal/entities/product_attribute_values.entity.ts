import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';
import { Product } from 'src/products/entities/product.entity';
import { ProductAttribute } from './product_attributes.entity';
import { Attribute } from './attributes.entity';
import { AttributeValue } from './attribute_values.entity';

const decimalToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? parseFloat(value) : value;
  },
};

/**
 * ✅ NOUVELLE TABLE
 * Valeurs d'un attribut autorisées pour UN produit.
 * Ex : T-shirt X → Couleur : Rouge (+0), Bleu (+0) ; Taille : M, L, XL (+2 $)
 */
@Entity('product_attribute_values')
@Unique('uq_pav_product_attribute_value', ['productAttributeId', 'attributeValueId'])
@Index('idx_pav_product', ['productId'])
export class ProductAttributeValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productAttributeId: string;

  @Column()
  productId: string;

  @Column()
  attributeId: string;

  @Column()
  attributeValueId: string;

  /** Supplément de prix appliqué quand le client choisit cette valeur (produit sans variation) */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, transformer: decimalToNumber })
  priceAdjustment: number;

  /** Valeur proposée par défaut */
  @Column({ default: false })
  isDefault: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => ProductAttribute, (pa) => pa.values, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productAttributeId' })
  productAttribute: ProductAttribute;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => Attribute, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attributeId' })
  attribute: Attribute;

  @ManyToOne(() => AttributeValue, (av) => av.productValues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attributeValueId' })
  attributeValue: AttributeValue;
}
