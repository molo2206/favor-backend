import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique } from 'typeorm';

import { Specification } from './Specification.entity';
import { Product } from 'src/products/entities/product.entity';

@Entity()
@Unique(['productId', 'specificationId'])
export class ProductSpecificationValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @Column()
  specificationId: string;

  @Column({ type: 'text', nullable: true })
  value?: string;

  @ManyToOne(() => Product, (product) => product.specificationValues, { onDelete: 'CASCADE' })
  product: Product;

  @ManyToOne(() => Specification, (specification) => specification.specificationValues)
  specification: Specification;
}
