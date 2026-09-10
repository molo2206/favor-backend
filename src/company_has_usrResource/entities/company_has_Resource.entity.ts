import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

import { CompanyEntity } from 'src/company/entities/company.entity';
import { Resource } from 'src/ressource/entity/resource.entity';

@Entity('company_has_resource')
@Index(['companyId', 'resourceId'], { unique: true })
export class CompanyHasResourceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: string;

  @Column()
  resourceId: string;

  // Relations
  @ManyToOne(() => CompanyEntity, (company) => company.companyResources, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity;

  @ManyToOne(() => Resource, (resource) => resource.companyResources, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'resourceId' })
  resource: Resource;

  // Permissions
  @Column({ type: 'boolean', default: false })
  can_create: boolean;

  @Column({ type: 'boolean', default: false })
  can_read: boolean;

  @Column({ type: 'boolean', default: false })
  can_update: boolean;

  @Column({ type: 'boolean', default: false })
  can_delete: boolean;

  @Column({ type: 'boolean', default: false })
  can_manage: boolean;

  @Column({ type: 'boolean', default: true })
  status: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
