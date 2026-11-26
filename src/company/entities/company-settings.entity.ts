// src/company/entities/company-settings.entity.ts

import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { CompanyEntity } from './company.entity';

@Entity('company_settings')
export class CompanySettingsEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'companyId', type: 'uuid' })
    companyId: string;

    @OneToOne(() => CompanyEntity, (company) => company.settings, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'companyId' })
    company: CompanyEntity;

    @Column({ type: 'boolean', default: false })
    enableLoyaltyFees: boolean;

    @Column({ type: 'float', nullable: true, default: 0 })
    loyaltyFeeFixed: number;

    // ✅ Tarification pro : prix appliqué aux FOURNISSEURS pour une expédition de cette entreprise
    @Column({ name: 'supplierPrice', type: 'decimal', precision: 10, scale: 2, nullable: true, default: 0 })
    supplierPrice: number;

    // ✅ Tarification pro : prix appliqué aux CLIENTS pour une expédition de cette entreprise
    @Column({ name: 'clientPrice', type: 'decimal', precision: 10, scale: 2, nullable: true, default: 0 })
    clientPrice: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}