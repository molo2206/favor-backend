import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from 'src/products/entities/product.entity';
import { QuotationEntity } from './quotation.entity';

@Entity('quotation_items')
export class QuotationItemEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ============================================================
    // 📝 DESCRIPTION
    // ============================================================
    @Column({ length: 500 })
    description: string;

    // ============================================================
    // 📊 QUANTITÉ & PRIX
    // ============================================================
    @Column({ type: 'int', default: 1 })
    quantity: number;

    @Column({ type: 'decimal', precision: 15, scale: 2 })
    unitPrice: number;

    @Column({ type: 'decimal', precision: 15, scale: 2 })
    totalPrice: number; // quantity × unitPrice

    // ============================================================
    // 🔗 RELATIONS
    // ============================================================

    // 🔹 Devis parent
    @ManyToOne(() => QuotationEntity, (q) => q.items, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'quotationId' })
    quotation: QuotationEntity;

    @Index('idx_quotation_items_quotation')
    @Column()
    quotationId: string;

    // 🔹 Produit (optionnel)
    @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'productId' })
    product?: Product;

    @Index('idx_quotation_items_product')
    @Column({ nullable: true })
    productId?: string;
}