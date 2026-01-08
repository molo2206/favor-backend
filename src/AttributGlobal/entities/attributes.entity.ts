import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
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
