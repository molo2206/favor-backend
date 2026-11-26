import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { City } from 'src/company/entities/city.entity';
import { CensusSource, CensusStatus, CensusType } from '../../common/enums/census.enum';
import { CensusFollowupEntity } from './census-followup.entity';

/**
 * ✅ FICHE DE RECENSEMENT d'un client ou d'un vendeur existant (pour le relancer)
 */
@Entity('census_records')
export class CensusRecordEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index('idx_census_type_status')
    @Column({ type: 'enum', enum: CensusType, default: CensusType.CLIENT })
    type: CensusType;

    // ---------------- Identité ----------------
    @Column({ length: 150 })
    fullName: string;

    /** Nom de la boutique / de l'entreprise (vendeur) */
    @Column({ length: 150, nullable: true })
    businessName?: string;

    @Index('idx_census_phone')
    @Column({ length: 30, nullable: true })
    phone?: string;

    @Column({ length: 30, nullable: true })
    whatsapp?: string;

    @Column({ length: 150, nullable: true })
    email?: string;

    // ---------------- Localisation ----------------
    @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'cityId' })
    city?: City;

    @Column({ length: 36, nullable: true })
    cityId?: string;

    /** Commune / quartier */
    @Column({ length: 150, nullable: true })
    district?: string;

    @Column({ length: 255, nullable: true })
    address?: string;

    // ---------------- Activité ----------------
    /** Secteur / ce qu'il vend ou achète (ex. « Restaurant », « Habits ») */
    @Column({ length: 150, nullable: true })
    activity?: string;

    /** Produits / services habituellement achetés ou vendus */
    @Column({ type: 'text', nullable: true })
    usualProducts?: string;

    /** Fréquence d'achat / de vente (ex. « chaque semaine ») */
    @Column({ length: 100, nullable: true })
    frequency?: string;

    /** Dernier achat / dernière vente connu(e) */
    @Column({ type: 'datetime', nullable: true })
    lastActivityAt?: Date;

    /** Pourquoi il ne commande / ne vend plus */
    @Column({ type: 'text', nullable: true })
    inactiveReason?: string;

    /** Besoins, attentes, avis */
    @Column({ type: 'text', nullable: true })
    needs?: string;

    /** Satisfaction 1 à 5 */
    @Column({ type: 'tinyint', nullable: true })
    satisfaction?: number;

    /** Accepte d'être recontacté */
    @Column({ type: 'boolean', default: true })
    consent: boolean;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    // ---------------- Lien avec la plateforme ----------------
    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'userId' })
    user?: UserEntity;

    /** Compte Favor Help du client / vendeur (trouvé par téléphone ou e-mail) */
    @Index('idx_census_user')
    @Column({ length: 36, nullable: true })
    userId?: string;

    @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'vendorCompanyId' })
    vendorCompany?: CompanyEntity;

    /** Entreprise du vendeur sur la plateforme */
    @Index('idx_census_vendor_company')
    @Column({ length: 36, nullable: true })
    vendorCompanyId?: string;

    // ---------------- Relance ----------------
    @Column({ type: 'enum', enum: CensusStatus, default: CensusStatus.TO_CONTACT })
    status: CensusStatus;

    @Column({ type: 'enum', enum: CensusSource, default: CensusSource.FIELD })
    source: CensusSource;

    @Index('idx_census_next_followup')
    @Column({ type: 'datetime', nullable: true })
    nextFollowUpAt?: Date;

    @Column({ type: 'datetime', nullable: true })
    lastContactAt?: Date;

    @Column({ type: 'int', default: 0 })
    contactCount: number;

    /** Agent qui a rempli la fiche */
    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'recordedById' })
    recordedBy?: UserEntity;

    @Column({ length: 36, nullable: true })
    recordedById?: string;

    /** Agent chargé de la relance */
    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'assignedToId' })
    assignedTo?: UserEntity;

    @Index('idx_census_assigned')
    @Column({ length: 36, nullable: true })
    assignedToId?: string;

    @ManyToOne(() => BranchEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'branchId' })
    branch?: BranchEntity;

    @Column({ length: 36, nullable: true })
    branchId?: string;

    @OneToMany(() => CensusFollowupEntity, (f) => f.record)
    followups: CensusFollowupEntity[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
