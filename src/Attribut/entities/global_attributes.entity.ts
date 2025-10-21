import { SpecFieldType } from 'src/specification/enum/SpecFieldType';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AttributeType } from '../enum/attribute_type.enum';

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

  @Column({ type: 'enum', enum: AttributeType })
  type: AttributeType;
}
