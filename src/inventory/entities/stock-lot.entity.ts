import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalNumber } from 'src/classifieds/entities/decimal.transformer';
import { StockLotStatus } from '../enums/inventory.enum';

/**
 * LOT d'un produit (pharmacie, denrées) : numéro de lot, péremption, fournisseur.
 * La logique FEFO consomme d'abord le lot dont `expiryDate` est la plus proche.
 */
@Entity('stock_lots')
@Index('idx_stock_lot_fefo', ['companyId', 'productId', 'status', 'expiryDate'])
@Index('idx_stock_lot_location', ['locationId', 'productId'])
export class StockLot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  locationId: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 80 })
  lotNumber: string;

  /** Date de péremption (NULL = sans péremption) */
  @Column({ type: 'date', nullable: true })
  expiryDate?: string | null;

  /** Quantité restante dans ce lot */
  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0, transformer: decimalNumber })
  quantity: number;

  /** Prix d'achat unitaire (optionnel, pour la valorisation) */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  costPrice?: number | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  supplier?: string | null;

  @Column({ type: 'enum', enum: StockLotStatus, default: StockLotStatus.ACTIVE })
  status: StockLotStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
