// src/products/image-search/product-search-embedding.entity.ts
import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * ✅ Index sémantique d'un produit pour la recherche par image.
 *    Vecteur (embedding) calculé à partir du nom, de la catégorie, de la marque et de la description.
 *    Stocké en base64 (Float32, normalisé) : la similarité = produit scalaire.
 */
@Entity('product_search_embeddings')
@Index('uq_product_search_embedding', ['productId'], { unique: true })
export class ProductSearchEmbedding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 60 })
  model: string;

  @Column({ type: 'int' })
  dims: number;

  /** Float32Array normalisé, encodé en base64 */
  @Column({ type: 'mediumtext' })
  vector: string;

  /** Empreinte du texte indexé : recalcul seulement si le produit change */
  @Column({ type: 'char', length: 64 })
  textHash: string;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
