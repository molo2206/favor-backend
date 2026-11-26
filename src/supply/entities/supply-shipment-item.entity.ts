import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { Supply } from './supply.entity';

/**
 * ✅ Articles pointés dans un colis (shipment) d'un Supply.
 *    Un Supply peut être expédié en PLUSIEURS colis : chaque ligne dit quel article
 *    de la commande (et combien) est parti dans quel colis.
 *    Jamais plus que la quantité commandée (contrôlé à la création du colis).
 */
@Entity('supply_shipment_items')
@Index('idx_ssi_supply', ['supplyId'])
@Index('idx_ssi_shipment', ['shipmentId'])
@Index('idx_ssi_item', ['orderItemId'])
export class SupplyShipmentItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  supplyId: string;

  @ManyToOne(() => Supply, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplyId' })
  supply?: Supply;

  @Column({ type: 'varchar', length: 36 })
  shipmentId: string;

  @ManyToOne(() => Shipment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipmentId' })
  shipment?: Shipment;

  /** Ligne de la commande : order_items.id (commande sans vendeur) ou sub_order_items.id (sous-commande) */
  @Column({ type: 'varchar', length: 36 })
  orderItemId: string;

  @Column({ type: 'varchar', length: 20, default: 'ORDER_ITEM' })
  itemSource: 'ORDER_ITEM' | 'SUB_ORDER_ITEM';

  @Column({ type: 'varchar', length: 36, nullable: true })
  productId?: string | null;

  /** Copie au moment du pointage (le produit peut changer de nom ensuite) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  productName?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  variationLabel?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sku?: string | null;

  /** Quantité de cet article dans CE colis */
  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  unitPrice?: number | null;

  /** Agent qui a pointé l'article */
  @Column({ type: 'varchar', length: 36, nullable: true })
  checkedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'checkedById' })
  checkedBy?: UserEntity | null;

  @CreateDateColumn()
  checkedAt: Date;
}
