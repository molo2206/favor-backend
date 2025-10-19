import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { GlobalAttributeValue } from './global_attribute_values.entity';

@Entity('global_attributes')
export class GlobalAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  platform: string; // 'ecommerce' | 'food' | 'grocery'

  @OneToMany(() => GlobalAttributeValue, (val) => val.attribute, {
    cascade: true,
  })
  values: GlobalAttributeValue[];

  @CreateDateColumn()
  createdAt: Date;
}
