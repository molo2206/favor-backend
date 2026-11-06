import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Product } from './product.entity';
import { Expose, Exclude } from 'class-transformer';
import { ProductVariation } from 'src/AttributGlobal/entities/product_variations.entity';

@Exclude()
@Entity()
export class ImageProductEntity {
  @Expose()
  @PrimaryGeneratedColumn()
  id: number;

  @Expose()
  @Column()
  url: string;

  @ManyToOne(() => Product, (product) => product.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @OneToMany(() => ProductVariation, (variation) => variation.image)
  variations: ProductVariation[];

  // ============================================================
  // 🎨 SIGNATURE VISUELLE
  // ============================================================
  @Column({ type: 'varchar', length: 64, nullable: true })
  imageHashPhash?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  imageHashDhash?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  imageHashAhash?: string;

  @Column({ type: 'text', nullable: true })
  imageColorHistogram?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  imageHashBlocks?: string;
}
