// src/contracts/entities/contract.entity.ts
import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProspectEntity } from '../../prospects/entities/prospect.entity';
import { ContractStatus } from '../../common/enums/contract-status.enum';

@Entity('contracts')
export class ContractEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ============================================================
    // 📌 IDENTIFICATION
    // ============================================================
    @Index('idx_contracts_number', { unique: true })
    @Column({ unique: true })
    number: string;

    @Column({ nullable: true, length: 100 })
    reference?: string;

    @Column()
    type: string;

    @Index('idx_contracts_status')
    @Column({ type: 'enum', enum: ContractStatus, default: ContractStatus.DRAFT })
    status: ContractStatus;

    // ============================================================
    // 🏢 ENTREPRISE (champ libre)
    // ============================================================
    @Column({ nullable: true, length: 255 })
    company?: string;

    // ============================================================
    // 📅 DATES
    // ============================================================
    @Index('idx_contracts_start_date')
    @Column({ type: 'timestamp' })
    startDate: Date;

    @Index('idx_contracts_end_date')
    @Column({ type: 'timestamp', nullable: true })
    endDate?: Date;

    // ============================================================
    // 💰 MONTANTS
    // ============================================================
    @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
    amount: number;

    @Column({ default: 'USD', length: 3 })
    currency: string;

    // ============================================================
    // 📝 CONTENU
    // ============================================================
    @Column({ type: 'text', nullable: true })
    terms?: string;

    @Column({ nullable: true })
    documentUrl?: string;

    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, any>;

    // ============================================================
    // 🔗 CLIENT (customerId → users.id)
    // ============================================================
    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'customerId' })
    customer?: UserEntity;

    @Index('idx_contracts_customer')
    @Column({ nullable: true })
    customerId?: string;

    // ============================================================
    // 🔗 PROSPECT
    // ============================================================
    @ManyToOne(() => ProspectEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'prospectId' })
    prospect?: ProspectEntity;

    @Index('idx_contracts_prospect')
    @Column({ nullable: true })
    prospectId?: string;

    // ============================================================
    // 👤 MANAGER
    // ============================================================
    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'managerId' })
    manager?: UserEntity;

    @Index('idx_contracts_manager')
    @Column({ nullable: true })
    managerId?: string;

    // ============================================================
    // 👤 CRÉATEUR
    // ============================================================
    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'createdById' })
    createdBy?: UserEntity;

    @Index('idx_contracts_created_by')
    @Column({ nullable: true })
    createdById?: string;

    // ============================================================
    // ✅ APPROBATION
    // ============================================================
    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'approvedById' })
    approvedBy?: UserEntity;

    @Index('idx_contracts_approved_by')
    @Column({ nullable: true })
    approvedById?: string;

    @Column({ type: 'timestamp', nullable: true })
    approvedAt?: Date;

    // ============================================================
    // ✍️ SIGNATURE
    // ============================================================
    @Column({ type: 'timestamp', nullable: true })
    signedAt?: Date;

    @Column({ nullable: true })
    signedBy?: string;

    // ============================================================
    // 🔄 RENOUVELLEMENT
    // ============================================================
    @Column({ default: false })
    autoRenew: boolean;

    // ============================================================
    // 📅 TIMESTAMPS
    // ============================================================
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}