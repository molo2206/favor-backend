import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Métadonnées PHARMACIE d'un produit (table séparée pour ne pas alourdir `products`).
 * Une ligne par produit concerné ; absente = produit en vente libre (OTC).
 */
@Entity('product_pharma_meta')
export class ProductPharmaMeta {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  productId: string;

  /** Vente soumise à ordonnance */
  @Column({ type: 'tinyint', width: 1, default: 0 })
  requiresPrescription: boolean;

  /** Produit contrôlé (psychotrope, stupéfiant) → registre */
  @Column({ type: 'tinyint', width: 1, default: 0 })
  isControlled: boolean;

  /** Dénomination Commune Internationale (molécule) */
  @Column({ type: 'varchar', length: 150, nullable: true })
  dci?: string | null;

  /** Dosage (ex. « 500 mg ») */
  @Column({ type: 'varchar', length: 60, nullable: true })
  dosage?: string | null;

  /** Nombre d'unités par boîte (si vente à l'unité/fraction) */
  @Column({ type: 'int', nullable: true })
  unitsPerPack?: number | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
