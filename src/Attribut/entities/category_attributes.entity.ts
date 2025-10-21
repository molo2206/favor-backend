import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { GlobalAttribute } from './global_attributes.entity';

@Entity('category_attributes')
export class CategoryAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CategoryEntity, (category) => category.categoryAttributes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: CategoryEntity;

  @ManyToOne(() => GlobalAttribute, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_id' })
  attribute: GlobalAttribute;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
