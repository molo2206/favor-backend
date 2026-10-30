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

@Entity('invoice_configuration')
export class InvoiceConfigurationEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Logo
    @Column({ type: 'varchar', length: 255, nullable: true })
    logo: string;

    // Coordonnées
    @Column({ type: 'varchar', length: 150, nullable: true })
    email: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    phone: string;

    @Column({ type: 'text', nullable: true })
    address: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    rccm: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    website: string;

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