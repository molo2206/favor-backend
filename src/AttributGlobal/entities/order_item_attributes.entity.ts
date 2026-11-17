import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  ValueTransformer,
} from 'typeorm';
import { OrderItemEntity } from 'src/order-item/entities/order-item.entity';
import { Attribute } from './attributes.entity';
import { AttributeValue } from './attribute_values.entity';

const decimalToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? parseFloat(value) : value;
  },
};

/**
 * ✅ NOUVELLE TABLE
 * Attributs choisis par le client pour une ligne de commande.
 * Le nom et la valeur sont COPIÉS au moment de la commande :
 * si l'attribut est renommé ou supprimé plus tard, la commande reste correcte.
 */
@Entity('order_item_attributes')
@Index('idx_oia_order_item', ['orderItemId'])
@Index('idx_oia_order', ['orderId'])
export class OrderItemAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderItemId: string;

  @Column()
  orderId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  attributeId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  attributeValueId?: string | null;

  // ---------- Copie (snapshot) au moment de la commande ----------
  @Column({ type: 'varchar', length: 255 })
  attributeName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  attributeSlug?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  attributeType?: string | null;

  @Column({ type: 'varchar', length: 255 })
  value: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, transformer: decimalToNumber })
  priceAdjustment: number;

  @CreateDateColumn()
  createdAt: Date;

  // Relations
  @ManyToOne(() => OrderItemEntity, (item) => item.selectedAttributes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderItemId' })
  orderItem: OrderItemEntity;

  @ManyToOne(() => Attribute, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'attributeId' })
  attribute?: Attribute | null;

  @ManyToOne(() => AttributeValue, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'attributeValueId' })
  attributeValue?: AttributeValue | null;
}
