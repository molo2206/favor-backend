import { Entity, PrimaryGeneratedColumn, ManyToOne, Unique, CreateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { PlatformEntity } from './plateforms.entity';
import { RoleEntity } from './roles.entity';

@Entity('user_platform_roles')
@Unique(['user', 'platform', 'role'])
export class UserPlatformRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserEntity, { eager: true })
  user: UserEntity;

  @ManyToOne(() => PlatformEntity, { eager: true })
  platform: PlatformEntity;

  @ManyToOne(() => RoleEntity, { eager: true })
  role: RoleEntity;

  @CreateDateColumn()
  createdAt: Date;
}
