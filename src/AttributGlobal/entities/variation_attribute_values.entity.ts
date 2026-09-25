import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ProductVariation } from './product_variations.entity';
import { Attribute } from './attributes.entity';
import { AttributeValue } from './attribute_values.entity';

@Entity('variation_attribute_values')
@Unique(['variationId', 'attributeId'])
export class VariationAttributeValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  variationId: string;

  @Column()
  attributeId: string;

  @Column()
  attributeValueId: string;

  // Relations
  @ManyToOne(() => ProductVariation, (variation) => variation.attributeValues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variationId' })
  variation: ProductVariation;

  @ManyToOne(() => Attribute, (attribute) => attribute.variations)
  @JoinColumn({ name: 'attributeId' })
  attribute: Attribute;

  @ManyToOne(() => AttributeValue, (value) => value.variations)
  @JoinColumn({ name: 'attributeValueId' })
  attributeValue: AttributeValue;
}
