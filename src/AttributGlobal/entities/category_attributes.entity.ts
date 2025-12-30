import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { Attribute } from './attributes.entity';

@Entity('category_attributes')
@Unique(['category', 'attribute']) // correspond à @@unique([categoryId, attributeId])
export class CategoryAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  categoryId: string;

  @Column()
  attributeId: string;

  @Column({ default: false })
  isRequired: boolean;

  @Column({ default: 0 })
  position: number;

  @CreateDateColumn()
  createdAt: Date;

  // Relations
  @ManyToOne(() => CategoryEntity, (category) => category.categoryAttributes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: CategoryEntity;

  @ManyToOne(() => Attribute, (attribute) => attribute.categories)
  @JoinColumn({ name: 'attributeId' })
  attribute: Attribute;
}
