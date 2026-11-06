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
import { Attribute } from './attributes.entity';
import { VariationAttributeValue } from './variation_attribute_values.entity';
import { ProductAttributeValue } from './product_attribute_values.entity';

@Entity('attribute_values')
@Unique(['attribute', 'value']) // correspond à @@unique([attributeId, value])
export class AttributeValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  value: string;

  @Column({ nullable: true })
  displayName?: string;

  @Column({ nullable: true })
  color?: string;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ nullable: true })
  position?: number;

  // ✅ NOUVEAU : une valeur désactivée n'est plus proposée
  @Column({ default: true })
  isActive: boolean;

  @Column()
  attributeId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Attribute, (attribute) => attribute.values, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attributeId' })
  attribute: Attribute;

  @OneToMany(() => VariationAttributeValue, (vav) => vav.attributeValue)
  variations: VariationAttributeValue[];

  @OneToMany(() => ProductAttributeValue, (pav) => pav.attributeValue)
  productValues: ProductAttributeValue[];
}
