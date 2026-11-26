import { OrderEntity } from 'src/order/entities/order.entity';
import { Product } from 'src/products/entities/product.entity';
import { ProductVariation } from 'src/AttributGlobal/entities/product_variations.entity';
import { OrderItemAttribute } from 'src/AttributGlobal/entities/order_item_attributes.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ItemAvailabilityStatus } from 'src/order/enum/availability-status.enum';

/** Copie des attributs choisis, stockée en JSON sur la ligne (lecture rapide, sans jointure) */
export interface OrderItemAttributeSnapshot {
  attributeId: string | null;
  attributeValueId: string | null;
  name: string;
  slug?: string | null;
  type?: string | null;
  value: string;
  displayName?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  priceAdjustment?: number;
}

@Entity('order_items')
export class OrderItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => OrderEntity, (order) => order.orderItems)
  order: OrderEntity;

  @Column()
  orderId: string;

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
  // ============================================================

  @Column({ type: 'varchar', length: 36, nullable: true })
  variationId?: string | null;

  @ManyToOne(() => ProductVariation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variationId' })
  variation?: ProductVariation | null;

  /** SKU de la variation au moment de la commande */
  @Column({ type: 'varchar', length: 255, nullable: true })
  sku?: string | null;

  /** Libellé lisible, ex : "Couleur : Rouge, Taille : XL" */
  @Column({ type: 'varchar', length: 500, nullable: true })
  variationLabel?: string | null;

  /** Copie JSON des attributs choisis */
  @Column({ type: 'json', nullable: true })
  attributesSnapshot?: OrderItemAttributeSnapshot[] | null;

  /** Détail des attributs choisis (table order_item_attributes) */
  @OneToMany(() => OrderItemAttribute, (attr) => attr.orderItem, { cascade: true })
  selectedAttributes: OrderItemAttribute[];

  // ============================================================
  // ✅ DISPONIBILITÉ CONFIRMÉE PAR LE PROPRIÉTAIRE DU PRODUIT
  //    PENDING (en attente) → AVAILABLE (disponible) / UNAVAILABLE (indisponible)
  //    NULL = anciennes commandes
  // ============================================================
  @Column({ type: 'enum', enum: ItemAvailabilityStatus, nullable: true, default: null })
  availabilityStatus?: ItemAvailabilityStatus | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  availabilityConfirmedAt?: Date | null;

  /** Utilisateur qui a confirmé (propriétaire, employé de la boutique ou admin) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  availabilityConfirmedById?: string | null;

  /** Remarque facultative du propriétaire (ex. « rupture jusqu'à lundi ») */
  @Column({ type: 'varchar', length: 500, nullable: true })
  availabilityNote?: string | null;
}
