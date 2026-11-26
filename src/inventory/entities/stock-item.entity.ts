import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { decimalNumber } from 'src/classifieds/entities/decimal.transformer';

/**
 * Niveau de stock d'un PRODUIT à un EMPLACEMENT donné.
 * `quantity` est l'agrégat courant (somme des lots si le type suit les lots).
 * La vérité reste le journal (stock_movements) ; cette ligne est l'état matérialisé pour la lecture rapide.
 */
@Entity('stock_items')
@Unique('uq_stock_item', ['locationId', 'productId'])
@Index('idx_stock_item_company_product', ['companyId', 'productId'])
export class StockItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  locationId: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  /** Quantité disponible (en unités de vente ; fractions possibles pour la pharmacie) */
  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0, transformer: decimalNumber })
  quantity: number;

  /** Quantité réservée (commandes en attente, paniers) — non vendable */
  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0, transformer: decimalNumber })
  reserved: number;

  /** Seuil d'alerte de stock bas (0 = pas d'alerte) */
  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0, transformer: decimalNumber })
  minQuantity: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
