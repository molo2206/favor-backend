import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { ProspectStatus } from '../../common/enums/prospect-status.enum';
import { ProspectSocialNetwork } from '../../common/enums/prospect-tracking.enum';

@Entity('prospects')
export class ProspectEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    fullName: string;

    @Column({ nullable: true })
    companyName?: string;

    @Index('idx_prospects_email')
    @Column({ nullable: true })
    email?: string;

    @Index('idx_prospects_phone')
    @Column({ nullable: true })
    phone?: string;

    @Column({ nullable: true })
    address?: string;

    @Column({ nullable: true })
    sector?: string;

    @Column({ nullable: true })
    source?: string;

    // ============================================================
    // ✅ Source « Réseau social » : réseau précisé
    // ============================================================
    @Column({ type: 'varchar', length: 20, nullable: true })
    socialNetwork?: ProspectSocialNetwork | null;

    /** Réseau « Autres » : nom saisi par l'agent */
    @Column({ type: 'varchar', length: 100, nullable: true })
    socialNetworkOther?: string | null;

    // ============================================================
    // ✅ Localisation (pays → ville du pays)
    // ============================================================
    @Index('idx_prospects_country')
    @Column({ type: 'varchar', length: 36, nullable: true })
    countryId?: string | null;

    /** Nom du pays au moment de l'enregistrement (affichage, statistiques) */
    @Column({ type: 'varchar', length: 120, nullable: true })
    countryName?: string | null;

    @Index('idx_prospects_city')
    @Column({ type: 'varchar', length: 36, nullable: true })
    cityId?: string | null;

    @Column({ type: 'varchar', length: 120, nullable: true })
    cityName?: string | null;

    /** ✅ Langue(s) parlée(s), ex. ["Français", "Swahili", "Lingala"] */
    @Column({ type: 'json', nullable: true })
    languages?: string[] | null;

    @Column({ type: 'text', nullable: true })
    identifiedNeed?: string;

    @Column({ nullable: true })
    productInterest?: string;

    @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
    estimatedBudget?: number;

    @Column({ type: 'int', default: 0 })
    conversionProbability: number;

    @Column({ type: 'enum', enum: ProspectStatus, default: ProspectStatus.NEW })
    status: ProspectStatus;

    @Column({ type: 'timestamp', nullable: true })
    lastContactAt?: Date;

    @Column({ type: 'timestamp', nullable: true })
    nextActionAt?: Date;

    @Column({ type: 'text', nullable: true })
    nextAction?: string;

    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'assignedToId' })
    assignedTo?: UserEntity;

    @Index('idx_prospects_assigned_to')
    @Column({ nullable: true })
    assignedToId?: string;

    @ManyToOne(() => CompanyEntity, { nullable: true })
    @JoinColumn({ name: 'companyId' })
    company?: CompanyEntity;

    @Index('idx_prospects_company')
    @Column({ nullable: true })
    companyId?: string;

    @ManyToOne(() => BranchEntity, { nullable: true })
    @JoinColumn({ name: 'branchId' })
    branch?: BranchEntity;

    @Index('idx_prospects_branch')
    @Column({ nullable: true })
    branchId?: string;

    // ============================================================
    // ✅ Suivi des agents
    // ============================================================
    /** Agent qui a enregistré le prospect */
    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'createdById' })
    createdBy?: UserEntity;

    @Index('idx_prospects_created_by')
    @Column({ type: 'varchar', length: 36, nullable: true })
    createdById?: string | null;

    /** Dernière assignation : qui l'a faite et quand */
    @Column({ type: 'varchar', length: 36, nullable: true })
    assignedById?: string | null;

    @Column({ type: 'datetime', nullable: true })
    assignedAt?: Date | null;

    /** Premier traitement (le statut quitte NEW) */
    @Column({ type: 'datetime', nullable: true })
    processedAt?: Date | null;

    @Column({ type: 'datetime', nullable: true })
    convertedAt?: Date | null;

    /** Rejeté / non intéressé (statut LOST) */
    @Column({ type: 'datetime', nullable: true })
    lostAt?: Date | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    lostReason?: string | null;

    @Column({ type: 'datetime', nullable: true })
    statusChangedAt?: Date | null;

    // ============================================================
    // ✅ Compte existant sur la plateforme (pas de doublon)
    // ============================================================
    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'linkedUserId' })
    linkedUser?: UserEntity;

    @Index('idx_prospects_linked_user')
    @Column({ type: 'varchar', length: 36, nullable: true })
    linkedUserId?: string | null;

    @Column({ type: 'datetime', nullable: true })
    linkedAt?: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}