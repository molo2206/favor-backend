import { CategoryAttribute } from 'src/Attribut/entities/category_attributes.entity';
import { Product } from 'src/products/entities/product.entity';
import { Service } from 'src/service/entities/service.entity';
import { CategorySpecification } from 'src/specification/entities/CategorySpecification.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('category')
export class CategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  image?: string;

  @Column({ unique: true })
  slug: string;

  @Column({ nullable: true })
  type?: string;

  @Column({ nullable: true })
  color?: string;

  @ManyToOne(() => CategoryEntity, (category) => category.children)
  @JoinColumn({ name: 'parent_id' })
  parent: CategoryEntity;

  @OneToMany(() => CategoryEntity, (category) => category.parent)
  children: CategoryEntity[];

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];

  @OneToMany(() => Service, (provider) => provider.category)
  providers: Service[];

  @OneToMany(() => CategorySpecification, (cs) => cs.category, { cascade: true })
  specifications: CategorySpecification[];

  @OneToMany(() => CategoryAttribute, (ca) => ca.category, { cascade: true })
  categoryAttributes: CategoryAttribute[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
