import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Unique,
  CreateDateColumn,
  Column,
} from 'typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserPlatformRoleEntity } from './user_plateform_roles.entity';
import { Resource } from 'src/ressource/entity/resource.entity';

@Entity('branch_user_platform_role_resources')
@Unique(['branch', 'userPlatformRole', 'resource'])
export class BranchUserPlatformRoleResourceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BranchEntity, { eager: true })
  branch?: BranchEntity;

  // ✅ Relation vers UserPlatformRoleEntity
  @ManyToOne(
    () => UserPlatformRoleEntity,
    (upr) => upr.branchUserPlatformRoleResources,
    { eager: false, onDelete: 'CASCADE' },
  )
  userPlatformRole: UserPlatformRoleEntity;

  @ManyToOne(() => Resource, { eager: true })
  resource: Resource;

  @Column({ default: false })
  create: boolean;

  @Column({ default: true })
  read: boolean;

  @Column({ default: false })
  update: boolean;

  @Column({ default: false })
  delete: boolean;

  @Column({ default: false })
  validate: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
