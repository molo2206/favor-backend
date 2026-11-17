import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { CustomerStatus, CustomerType } from '../../common/enums/customer.enum';

@Entity('commercial_customers')
export class CustomerEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    fullName: string;

    @Column({ nullable: true })
    companyName?: string;

    @Index('idx_customers_email')
    @Column({ nullable: true })
    email?: string;

    @Index('idx_customers_phone')
    @Column({ nullable: true })
    phone?: string;

    @Column({ nullable: true })
    address?: string;

    @Column({ nullable: true })
    sector?: string;

    @Column({ type: 'enum', enum: CustomerType, default: CustomerType.INDIVIDUAL })
    type: CustomerType;

    @Column({ type: 'enum', enum: CustomerStatus, default: CustomerStatus.LEAD })
    status: CustomerStatus;

    // 🔹 LIEN avec User (auth)
    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'userId' })
    user?: UserEntity;

    @Index('idx_customers_user')
    @Column({ nullable: true })
    userId?: string;

    // 🔹 Commercial responsable
    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'commercialManagerId' })
    commercialManager?: UserEntity;

    @Index('idx_customers_manager')
    @Column({ nullable: true })
    commercialManagerId?: string;

    @ManyToOne(() => CompanyEntity, { nullable: true })
    @JoinColumn({ name: 'companyId' })
    company?: CompanyEntity;

    @Index('idx_customers_company')
    @Column({ nullable: true })
    companyId?: string;

    @ManyToOne(() => BranchEntity, { nullable: true })
    @JoinColumn({ name: 'branchId' })
    branch?: BranchEntity;

    @Index('idx_customers_branch')
    @Column({ nullable: true })
    branchId?: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}