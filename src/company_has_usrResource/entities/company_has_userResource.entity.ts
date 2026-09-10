import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { Resource } from 'src/ressource/entity/resource.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';

@Entity('company_has_user_resource')
@Unique('uq_user_company_resource', ['userCompanyId', 'resourceId', 'branchId'])
@Index('idx_user_company', ['userCompanyId'])
@Index('idx_resource', ['resourceId'])
export class CompanyHasUserResource {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userCompanyId: string;

  @Column({ type: 'varchar', length: 36 })
  resourceId: string;

  @Column({ type: 'varchar', length: 36 })
  branchId: string;

  @Column({ name: 'can_create', type: 'tinyint', default: 0 })
  canCreate: boolean;

  @Column({ name: 'can_read', type: 'tinyint', default: 0 })
  canRead: boolean;

  @Column({ name: 'can_update', type: 'tinyint', default: 0 })
  canUpdate: boolean;

  @Column({ name: 'can_delete', type: 'tinyint', default: 0 })
  canDelete: boolean;

  @Column({ name: 'can_manage', type: 'tinyint', default: 0 })
  canManage: boolean;

  @Column({ type: 'tinyint', default: 1 })
  status: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'datetime',
    precision: 6,
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  updatedAt: Date;

  // Dans la classe CompanyHasUserResource, ajouter :
  @ManyToOne(() => BranchEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'branchId' })
  branch: BranchEntity;

  // 🔗 USER HAS COMPANY
  @ManyToOne(() => UserHasCompanyEntity, (uhc) => uhc.resources, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userCompanyId' })
  userCompany: UserHasCompanyEntity;

  // 🔗 RESOURCE (FIX ICI)
  @ManyToOne(() => Resource, (resource) => resource.companyUserResources, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'resourceId' })
  resource: Resource;
}
