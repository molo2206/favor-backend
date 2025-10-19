import { Product } from 'src/products/entities/product.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';

@Entity('skus')
export class Sku {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @ManyToOne(() => Product, (product) => product.skus, {
    onDelete: 'CASCADE',
  })
  product: Product;

  @Column({ nullable: true, unique: true })
  skuCode?: string;

  @Column('float')
  price: number;

  @Column('int')
  stock: number;

  @Column('json')
  attributesJson: Record<string, any>; // ex: {"Taille":"M","Couleur":"Rouge"}

  @Column({ nullable: true })
  imageUrl?: string;

  @CreateDateColumn()
  createdAt: Date;
}
