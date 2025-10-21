import { SpecFieldType } from 'src/specification/enum/SpecFieldType';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('global_attributes')
export class GlobalAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'enum', enum: SpecFieldType })
  type: SpecFieldType;

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
}
