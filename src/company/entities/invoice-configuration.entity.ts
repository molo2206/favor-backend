// src/company/entities/invoice-configuration.entity.ts
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

export interface InvoiceTheme {
    primaryColor?: string;
    secondaryColor?: string;
    textColor?: string;
    fontFamily?: string;
}

@Entity('invoice_configuration')
export class InvoiceConfigurationEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // En-tête
    @Column({ type: 'text', nullable: true })
    header: string;

    // Pied de page
    @Column({ type: 'text', nullable: true })
    footer: string;

    // Logo
    @Column({ type: 'varchar', length: 255, nullable: true })
    logo: string;

    // Thème (JSON)
    @Column({ type: 'json', nullable: true })
    theme: InvoiceTheme;

    @OneToOne(() => CompanyEntity, (company) => company.invoiceConfiguration, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'companyId' })
    company: CompanyEntity;

    @Column()
    companyId: string;

    @CreateDateColumn({ type: 'timestamp' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updatedAt: Date;
}