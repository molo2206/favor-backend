import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Unique,
} from 'typeorm';
import { AttributeType } from '../enum/attributeType.enum';
import { AttributeValue } from './attribute_values.entity';
import { ProductAttribute } from './product_attributes.entity';
import { CategoryAttribute } from './category_attributes.entity';
import { VariationAttributeValue } from './variation_attribute_values.entity';

@Entity('attributes')
@Unique(['slug'])
export class Attribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  slug: string;

  @Column({ type: 'enum', enum: AttributeType })
  type: AttributeType;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: false })
  isRequired: boolean;

  @Column({ default: true })
  isFilterable: boolean;

  // ============================================================
  // ✅ NOUVEAUX CHAMPS
  // ============================================================

  /** Sert à créer des variations (le client doit choisir une valeur) */
  @Column({ default: true })
  isVariant: boolean;

  /** Affiché sur la fiche produit */
  @Column({ default: true })
  isVisible: boolean;

  @Column({ default: true })
  isActive: boolean;

  /** Unité pour les attributs NUMBER (Go, kg, cm, L…) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  unit?: string | null;

  @Column({ type: 'int', default: 0 })
  position: number;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => AttributeValue, (value) => value.attribute)
  values: AttributeValue[];

  @OneToMany(() => ProductAttribute, (pa) => pa.attribute)
  products: ProductAttribute[];

  @OneToMany(() => CategoryAttribute, (ca) => ca.attribute)
  categories: CategoryAttribute[];

  @OneToMany(() => VariationAttributeValue, (vav) => vav.attribute)
  variations: VariationAttributeValue[];
}
