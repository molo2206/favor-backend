import { Product } from 'src/products/entities/product.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Attribute } from './attributes.entity';
import { ProductAttributeValue } from './product_attribute_values.entity';

@Entity('product_attributes')
@Unique(['product', 'attribute']) // correspond à @@unique([productId, attributeId])
export class ProductAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @Column()
  attributeId: string;

  // ============================================================
  // ✅ NOUVEAUX CHAMPS
  // ============================================================

  /** Le client doit choisir une valeur au moment de la commande */
  @Column({ default: false })
  isRequired: boolean;

  /** Cet attribut sert à composer les variations du produit */
  @Column({ default: true })
  isVariant: boolean;

  /** Affiché sur la fiche produit */
  @Column({ default: true })
  isVisible: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;

  /** Valeur libre pour les attributs TEXT / NUMBER / BOOLEAN (ex : "100% coton") */
  @Column({ type: 'varchar', length: 255, nullable: true })
  customValue?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Product, (product) => product.attributes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => Attribute, (attribute) => attribute.products)
  @JoinColumn({ name: 'attributeId' })
  attribute: Attribute;

  /** Valeurs autorisées pour ce produit (ex : Rouge, Bleu pour l'attribut Couleur) */
  @OneToMany(() => ProductAttributeValue, (pav) => pav.productAttribute, { cascade: true })
  values: ProductAttributeValue[];
}
