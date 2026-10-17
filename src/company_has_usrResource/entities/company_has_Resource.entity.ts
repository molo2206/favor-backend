// src/company_has_usrResource/entities/company_has_Resource.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserHasResourceEntity } from 'src/users/entities/user-has-resource.entity';

@Entity('company_has_resource')
export class CompanyHasResourceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CompanyEntity, (company) => company.companyResources, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity;

  @Column({ nullable: true })
  companyId: string;

  @ManyToOne(() => UserHasResourceEntity, { nullable: true })
  @JoinColumn({ name: 'resourceId' })
  resource: UserHasResourceEntity;

  @Column({ nullable: true })
  resourceId: string;
}