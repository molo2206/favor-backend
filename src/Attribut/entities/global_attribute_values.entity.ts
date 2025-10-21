import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { GlobalAttribute } from './global_attributes.entity';

@Entity('global_attribute_values')
export class GlobalAttributeValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  value: string;

  @Column()
  attributeId: string;

  @ManyToOne(() => GlobalAttribute, (attr) => attr.values, { onDelete: 'CASCADE' })
  attribute: GlobalAttribute;
}
