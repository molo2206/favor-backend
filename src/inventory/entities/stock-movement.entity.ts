import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { decimalNumber } from 'src/classifieds/entities/decimal.transformer';
import { StockMovementSource, StockMovementType } from '../enums/inventory.enum';

/**
 * JOURNAL des mouvements de stock (source de vérité, non modifiable).
 * Chaque entrée/sortie/ajustement/transfert y est tracée avec sa référence.
 */
@Entity('stock_movements')
@Index('idx_stock_mvt_product', ['companyId', 'productId', 'createdAt'])
@Index('idx_stock_mvt_location', ['locationId', 'createdAt'])
@Index('idx_stock_mvt_ref', ['reference'])
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  locationId: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  lotId?: string | null;

  @Column({ type: 'enum', enum: StockMovementType })
  type: StockMovementType;

  @Column({ type: 'enum', enum: StockMovementSource, default: StockMovementSource.MANUAL })
  source: StockMovementSource;

  /** Quantité du mouvement (toujours positive ; le sens est donné par `type`) */
  @Column({ type: 'decimal', precision: 14, scale: 3, transformer: decimalNumber })
  quantity: number;

  /** Stock résultant à l'emplacement après ce mouvement (pour audit) */
  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true, transformer: decimalNumber })
  balanceAfter?: number | null;

  /** Référence métier (n° de vente POS, commande, transfert, clé de synchro offline) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  reference?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  performedById?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
