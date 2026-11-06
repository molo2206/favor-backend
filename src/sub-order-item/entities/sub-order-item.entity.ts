import { Product } from 'src/products/entities/product.entity';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import { ProductVariation } from 'src/AttributGlobal/entities/product_variations.entity';
import { OrderItemAttributeSnapshot } from 'src/order-item/entities/order-item.entity';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('sub_order_items')
export class SubOrderItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SubOrderEntity, (subOrder) => subOrder.items)
  subOrder: SubOrderEntity;

  @Column()
  subOrderId: string;

  @ManyToOne(() => Product)
  product: Product;

  @Column()
  productId: string;

  @Column()
  quantity: number;

  @Column({ type: 'float', nullable: false })
  price: number;

  // ============================================================
  // ✅ NOUVEAUX CHAMPS : VARIATION / ATTRIBUTS CHOISIS
  //    (le vendeur voit exactement ce que le client a choisi)
  // ============================================================

  @Column({ type: 'varchar', length: 36, nullable: true })
  variationId?: string | null;

  @ManyToOne(() => ProductVariation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variationId' })
  variation?: ProductVariation | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sku?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  variationLabel?: string | null;

  @Column({ type: 'json', nullable: true })
  attributesSnapshot?: OrderItemAttributeSnapshot[] | null;
}
