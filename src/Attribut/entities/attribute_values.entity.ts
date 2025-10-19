import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';
import { ProductAttribute } from './product_attributes.entity';

@Entity('attribute_values')
export class AttributeValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  attributeId: string;

  @ManyToOne(() => ProductAttribute, (attr) => attr.values, {
    onDelete: 'CASCADE',
  })
  attribute: ProductAttribute;

  @Column()
  value: string;
}
