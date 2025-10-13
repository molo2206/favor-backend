import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPlatformRoleEntity } from './entities/user_plateform_roles.entity';
import { AssignRoleDto } from './dto/roles_plateforme_user/assign-role.dto';
import { UserEntity } from './entities/user.entity';
import { PlatformEntity } from './entities/plateforms.entity';
import { RoleEntity } from './entities/roles.entity';

@Injectable()
export class UserPlatformRoleService {
  constructor(
    @InjectRepository(UserPlatformRoleEntity)
    private readonly uprRepo: Repository<UserPlatformRoleEntity>,
  ) {}

  async assignRole(dto: AssignRoleDto) {
    const existing = await this.uprRepo.findOne({
      where: {
        user: { id: dto.userId },
        platform: { id: dto.platformId },
        role: { id: dto.roleId },
      },
    });

    if (existing) {
      throw new ConflictException('Ce rôle est déjà attribué à cet utilisateur pour cette plateforme');
    }

    const entity = this.uprRepo.create({
      user: { id: dto.userId } as UserEntity,
      platform: { id: dto.platformId } as PlatformEntity,
      role: { id: dto.roleId } as RoleEntity,
    });

    return await this.uprRepo.save(entity);
  }

  async findRolesByUser(userId: string) {
    return this.uprRepo.find({ where: { user: { id: userId } } });
  }

  async remove(id: string) {
    return await this.uprRepo.delete(id);
  }
}
