import { SpecFieldType } from 'src/specification/enum/SpecFieldType';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { AttributeType } from '../enum/attribute_type.enum';
import { CategoryAttribute } from './category_attributes.entity';

@Entity('global_attributes')
export class GlobalAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

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

  @Column({ type: 'varchar', length: 20 }) 
  type: string;

  @OneToMany(() => CategoryAttribute, (ca) => ca.attribute)
  categoryLinks: CategoryAttribute[];
}
