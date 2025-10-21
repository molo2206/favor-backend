import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn } from 'typeorm';
import { GlobalAttributeValue } from './global_attribute_values.entity';
import { CategorySpecification } from 'src/specification/entities/CategorySpecification.entity';
import { GlobalAttributesSpecification } from './global_attributes_specification.entity';

@Entity('global_attributes')
export class GlobalAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @OneToMany(() => GlobalAttributeValue, (val) => val.attribute, {
    cascade: true,
  })
  values: GlobalAttributeValue[];

  @OneToMany(() => GlobalAttributesSpecification, (gas) => gas.globalAttribute, {
    cascade: true,
  })
  specifications: GlobalAttributesSpecification[];

  @CreateDateColumn()
  createdAt: Date;
}
