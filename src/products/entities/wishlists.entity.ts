// src/wishlist/entities/wishlist.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Unique,
  Column,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { Product } from 'src/products/entities/product.entity';

@Entity('wishlists')
@Unique(['user', 'product']) // empêche un doublon pour le même user et produit
export class Wishlist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  shopType?: string;

  @ManyToOne(() => UserEntity, (user) => user.wishlist, { onDelete: 'CASCADE' })
  user: UserEntity;

  @ManyToOne(() => Product, (product) => product.wishlist, { onDelete: 'CASCADE' })
  product: Product;

  @Column({ default: false })
  deleted: boolean;

  @Column({ default: false })
  status: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
