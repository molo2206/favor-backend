// src/hr/payroll/entities/payroll-item.entity.ts
import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { PayslipLineType } from './payslip-line.entity';

export enum PayrollItemCalculation {
    FIXED = 'FIXED',                 // Montant fixe (ex: prime de transport 20 000)
    PERCENTAGE = 'PERCENTAGE',       // % du salaire brut (ex: CNSS 5%)
    PERCENTAGE_NET = 'PERCENTAGE_NET', // % du net (ex: impôt 15%)
}

@Entity('hr_payroll_items')
export class PayrollItemEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => CompanyEntity, { nullable: true })
    @JoinColumn({ name: 'companyId' })
    company?: CompanyEntity;

    @Index('idx_hr_payroll_items_company')
    @Column({ nullable: true })
    companyId?: string;

    @Column()
    code: string; // 'PRIME_TRANSPORT', 'CNSS', 'IMPOT_REVENU'

    @Column()
    label: string; // 'Prime de transport', 'CNSS', 'Impôt sur le revenu'

    @Column({ type: 'enum', enum: PayslipLineType })
    type: PayslipLineType; // EARNING ou DEDUCTION

    @Column({ type: 'enum', enum: PayrollItemCalculation })
    calculation: PayrollItemCalculation;

    @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
    value: number; // Montant fixe OU taux (ex: 5.00 pour 5%)

    @Column({ default: true })
    isActive: boolean;

    @Column({ default: false })
    isMandatory: boolean; // Obligatoire (ex: CNSS) vs optionnel (ex: prime)

    @Column({ type: 'int', default: 0 })
    order: number; // Ordre d'affichage

    @Column({ type: 'text', nullable: true })
    description?: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}