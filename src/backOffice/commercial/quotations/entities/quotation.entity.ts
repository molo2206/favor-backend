import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CustomerEntity } from '../../customers/entities/customer.entity';
import { QuotationItemEntity } from './quotation-item.entity';
import { QuotationStatus } from '../../common/enums/quotation-status.enum';

@Entity('quotations')
export class QuotationEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ============================================================
    // 📌 IDENTIFICATION
    // ============================================================
    @Index('idx_quotations_number', { unique: true })
    @Column({ unique: true, length: 50 })
    number: string;

    // ============================================================
    // 📊 STATUT & MONTANTS
    // ============================================================
    @Column({
        type: 'enum',
        enum: QuotationStatus,
        default: QuotationStatus.DRAFT,
    })
    status: QuotationStatus;

    @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
    subtotal: number;

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
    discountRate: number;

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
    taxRate: number;

    @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
    total: number;

    @Column({ default: 'USD', length: 3 })
    currency: string;

    // ============================================================
    // 📅 DATES
    // ============================================================
    @Column({ type: 'timestamp', nullable: true })
    validUntil?: Date;

    @Column({ type: 'timestamp', nullable: true })
    sentAt?: Date;

    @Column({ type: 'timestamp', nullable: true })
    acceptedAt?: Date;

    @Column({ type: 'timestamp', nullable: true })
    rejectedAt?: Date;

    // ============================================================
    // 📝 CONDITIONS
    // ============================================================
    @Column({ type: 'text', nullable: true })
    paymentTerms?: string;

    // ============================================================
    // 🔗 RELATIONS
    // ============================================================

    // 🔹 Client
    @ManyToOne(() => CustomerEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'customerId' })
    customer?: CustomerEntity;

    @Index('idx_quotations_customer')
    @Column({ nullable: true })
    customerId?: string;

    // 🔹 Commercial responsable
    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'salesRepId' })
    salesRep?: UserEntity;

    @Index('idx_quotations_sales_rep')
    @Column({ nullable: true })
    salesRepId?: string;

    // 🔹 Lignes du devis
    @OneToMany(() => QuotationItemEntity, (item) => item.quotation, {
        cascade: true,
        eager: false,
    })
    items: QuotationItemEntity[];

    // ============================================================
    // 📅 TIMESTAMPS
    // ============================================================
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}