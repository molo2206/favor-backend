import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    OneToMany
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserHasCompanyPermissionEntity } from 'src/user_has_company_permissions/entities/user_has_company_permission.entity';
import { RoleUser } from 'src/role_user/entities/role_user.entity';

@Entity('user_has_company')
export class UserHasCompanyEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ default: false })
    isOwner: boolean;

    @ManyToOne(() => UserEntity, user => user.userHasCompany)
    user: UserEntity;

    @ManyToOne(() => CompanyEntity, company => company.userHasCompany, { eager: true })
    @JoinColumn({ name: 'companyId' })
    company: CompanyEntity;

    @OneToMany(() => UserHasCompanyPermissionEntity, (uhcPermission) => uhcPermission.userHasCompany)
    permissions: UserHasCompanyPermissionEntity[];

    @ManyToOne(() => RoleUser, { eager: true })
    @JoinColumn({ name: 'roleId' })
    role: RoleUser;
}
