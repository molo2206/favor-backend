import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';

@Entity('user_has_company')
export class UserHasCompanyEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => UserEntity)
    @JoinColumn({ name: 'userId' })
    user: UserEntity;

    @ManyToOne(() => CompanyEntity)
    @JoinColumn({ name: 'companyId' })
    company: CompanyEntity;

    @Column({ default: false })
    isOwner: boolean;

    // @ManyToOne(() => UserEntity, user => user.userHasCompanies)
    // user_: UserEntity;

    // @ManyToOne(() => CompanyEntity, company => company.userHasCompanies)
    // company_: CompanyEntity;

    @ManyToOne(() => UserEntity, (user) => user.userHasCompanies, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user_: UserEntity;

    @ManyToOne(() => CompanyEntity, (company) => company.userHasCompanies, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'company_id' })
    company_: CompanyEntity;
}
