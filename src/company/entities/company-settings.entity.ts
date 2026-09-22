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

    // ============================================
    // RELATION AVEC LA COMPANY
    // ============================================
    @Column({ name: 'companyId', type: 'uuid' })
    companyId: string;

    @OneToOne(() => CompanyEntity, (company) => company.settings, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'companyId' })
    company: CompanyEntity;

    // ============================================
    // FRAIS DE FIDÉLITÉ
    // ============================================
    @Column({ type: 'boolean', default: false })
    enableLoyaltyFees: boolean;

    @Column({ type: 'float', nullable: true, default: 0 })
    loyaltyFeeFixed: number;

    // ============================================
    // TIMESTAMPS
    // ============================================
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}