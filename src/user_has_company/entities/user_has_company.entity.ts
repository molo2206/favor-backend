import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { RoleUser } from 'src/role_user/entities/role_user.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';

@Entity('user_has_company')
export class UserHasCompanyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: false })
  isOwner: boolean;

  @ManyToOne(() => UserEntity, (user) => user.userHasCompany)
  user: UserEntity;

  @ManyToOne(() => CompanyEntity, (company) => company.userHasCompany, {
    eager: true,
  })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity;

  // =========================
  // ROLE
  // =========================
  @ManyToOne(() => RoleUser, { eager: true })
  @JoinColumn({ name: 'roleId' })
  role: RoleUser;

  // =========================
  // BRANCH (NOUVEAU)
  // =========================
  @ManyToOne(() => BranchEntity, { nullable: true })
  @JoinColumn({ name: 'branchId' })
  branch: BranchEntity;

  @Column({ nullable: true })
  branchId: string;

  // =========================
  // COMPANY RESOURCES (PERMISSIONS)
  // =========================
  @OneToMany(() => CompanyHasUserResource, (chr) => chr.userCompany)
  resources: CompanyHasUserResource[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
