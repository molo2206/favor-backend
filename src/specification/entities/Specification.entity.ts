import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SpecFieldType } from '../enum/SpecFieldType';
import { CategorySpecification } from './CategorySpecification.entity';
import { ProductSpecificationValue } from './ProductSpecificationValue.entity';
@Entity()
export class Specification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ nullable: true })
  image?: string;

  @Column({ type: 'enum', enum: SpecFieldType })
  type: SpecFieldType;

  @Column({ nullable: true })
  unit?: string;

  @Column({ type: 'longtext', nullable: true })
  options: string | null;

  @Column({ default: false })
  deleted: boolean;

  @Column({ default: true })
  status: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => CategorySpecification, (cs) => cs.specification)
  categories: CategorySpecification[];

  @OneToMany(() => ProductSpecificationValue, (pv) => pv.specification)
  specificationValues: ProductSpecificationValue[];
}
