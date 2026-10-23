import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique } from 'typeorm';
import { Specification } from './Specification.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';

@Entity()
@Unique(['categoryId', 'specificationId'])
export class CategorySpecification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  categoryId: string;

  @Column()
  specificationId: string;

  @Column({ default: false })
  required: boolean;

  @Column({ default: 0 })
  displayOrder: number;

  @ManyToOne(() => CategoryEntity, category => category.specifications)
  category: CategoryEntity;

  @ManyToOne(() => Specification, specification => specification.categories)
  specification: Specification;
}
