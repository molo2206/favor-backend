import { CategoryAttribute } from 'src/AttributGlobal/entities/category_attributes.entity';
import { Pricing } from 'src/Course et Taxi/Pricing/entity/Pricing.entity';
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

  @Column({ default: true })
  status: boolean;

  @Column()
  maxPassengers?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price?: number;

  @Column({ default: false })
  deleted: boolean;

  @ManyToOne(() => CategoryEntity, (category) => category.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: CategoryEntity | null;

  @OneToMany(() => CategoryEntity, (category) => category.parent)
  children: CategoryEntity[];

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];

  @OneToMany(() => Service, (provider) => provider.category)
  providers: Service[];

  @OneToMany(() => CategorySpecification, (cs) => cs.category, {
    cascade: true,
  })
  specifications: CategorySpecification[];

  @OneToMany(() => Pricing, (pricing) => pricing.category)
  pricings: Pricing[];

  @OneToMany(() => CategoryAttribute, (ca) => ca.category, {
    cascade: true,
    eager: true,
  })
  categoryAttributes: CategoryAttribute[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
