import { SpecFieldType } from 'src/specification/enum/SpecFieldType';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GlobalAttributeValue } from './global_attribute_values.entity';

@Entity('global_attributes')
export class GlobalAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ unique: true })
  key: string;

  @Column()
  label: string;
  
  @Column({ nullable: true })
  unit?: string;

  @Column({ type: 'json', nullable: true })
  options?: any;

  @Column({ default: false })
  deleted: boolean;

  @Column({ default: true })
  status: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => GlobalAttributeValue, (val) => val.attribute, { cascade: true })
  values: GlobalAttributeValue[];
}
