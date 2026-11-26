import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { decimalNumber } from 'src/classifieds/entities/decimal.transformer';
import { PosSale } from './pos-sale.entity';

/** Ligne d'un ticket de caisse (snapshot du produit au moment de la vente) */
@Entity('pos_sale_items')
@Index('idx_pos_sale_item_sale', ['saleId'])
@Index('idx_pos_sale_item_product', ['productId'])
export class PosSaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  saleId: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  /** Emplacement de stock d'où est sortie la ligne */
  @Column({ type: 'varchar', length: 36, nullable: true })
  locationId?: string | null;

  @Column({ type: 'varchar', length: 200 })
  productName: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0, transformer: decimalNumber })
  quantity: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  lineTotal: number;

  @ManyToOne(() => PosSale, (s) => s.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'saleId' })
  sale: PosSale;
}
