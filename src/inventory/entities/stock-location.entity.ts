import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { StockLocationType } from '../enums/inventory.enum';

/**
 * Emplacement de stock d'une entreprise : dépôt, rayon, chambre froide…
 * Rattaché à une société (companyId) et éventuellement à une branche (branchId).
 */
@Entity('stock_locations')
@Index('idx_stock_location_company', ['companyId', 'isActive'])
export class StockLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  branchId?: string | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'enum', enum: StockLocationType, default: StockLocationType.SHELF })
  type: StockLocationType;

  /** Emplacement de vente par défaut (sorties de caisse) */
  @Column({ type: 'tinyint', width: 1, default: 0 })
  isDefaultSale: boolean;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
