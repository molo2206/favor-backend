import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPlatformRoleEntity } from './entities/user_plateform_roles.entity';
import { UserEntity } from './entities/user.entity';
import { PlatformEntity } from './entities/plateforms.entity';
import { RoleEntity } from './entities/roles.entity';

interface AssignmentDto {
  platformId: string;
  roleId: string;
}

export interface AssignRoleDto {
  userId: string;
  platforms: AssignmentDto[];
}
@Injectable()
export class UserPlatformRoleService {
  constructor(
    @InjectRepository(UserPlatformRoleEntity)
    private readonly uprRepo: Repository<UserPlatformRoleEntity>,
  ) {}

  async assignRole(dto: AssignRoleDto) {
    const results: UserPlatformRoleEntity[] = [];

    for (const assign of dto.platforms) {
      const existing = await this.uprRepo.findOne({
        where: {
          user: { id: dto.userId },
          platform: { id: assign.platformId },
          role: { id: assign.roleId },
        },
      });

      if (existing) {
        // Ignore les doublons
        continue;
      }

      const entity = this.uprRepo.create({
        user: { id: dto.userId } as UserEntity,
        platform: { id: assign.platformId } as PlatformEntity,
        role: { id: assign.roleId } as RoleEntity,
      });

      results.push(await this.uprRepo.save(entity));
    }

    return {
      message: `Rôles assignés avec succès (${results.length})`,
      data: results,
    };
  }

  async findRolesByUser(userId: string) {
    return this.uprRepo.find({ where: { user: { id: userId } } });
  }

  async remove(id: string) {
    return await this.uprRepo.delete(id);
  }
}
