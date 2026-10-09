import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { ProspectStatus } from '../../common/enums/prospect-status.enum';

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

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}