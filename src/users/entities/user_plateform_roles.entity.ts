import { Entity, PrimaryGeneratedColumn, ManyToOne, Unique, CreateDateColumn, OneToMany } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { PlatformEntity } from './plateforms.entity';
import { RoleEntity } from './roles.entity';
import { BranchUserPlatformRoleResourceEntity } from './branch-user-platform-role-resource.entity';

@Entity('user_platform_roles')
@Unique(['user', 'platform', 'role'])
export class UserPlatformRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserEntity, (user) => user.userPlatformRoles, { eager: true })
  user: UserEntity;

  @ManyToOne(() => PlatformEntity, { eager: true })
  platform: PlatformEntity;

  @ManyToOne(() => RoleEntity, { eager: true })
  role: RoleEntity;

  // ✅ Relation inverse avec BranchUserPlatformRoleResourceEntity
  @OneToMany(
    () => BranchUserPlatformRoleResourceEntity,
    (bpr) => bpr.userPlatformRole,
    { cascade: true },
  )
  branchUserPlatformRoleResources: BranchUserPlatformRoleResourceEntity[];

  @CreateDateColumn()
  createdAt: Date;
}
