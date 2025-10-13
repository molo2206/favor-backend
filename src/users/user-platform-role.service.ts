import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

    @InjectRepository(PlatformEntity)
    private readonly platformRepo: Repository<PlatformEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
  ) {}

  async assignRole(dto: AssignRoleDto) {
    const results: UserPlatformRoleEntity[] = [];

    // Vérifie que l'utilisateur existe
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException(`Utilisateur avec ID ${dto.userId} introuvable`);

    for (const assign of dto.platforms) {
      // Vérifie que la plateforme existe
      const platform = await this.platformRepo.findOne({ where: { id: assign.platformId } });
      if (!platform)
        throw new NotFoundException(`Plateforme avec ID ${assign.platformId} introuvable`);

      // Vérifie que le rôle existe
      const role = await this.roleRepo.findOne({ where: { id: assign.roleId } });
      if (!role) throw new NotFoundException(`Rôle avec ID ${assign.roleId} introuvable`);

      // Cherche si une assignation spécifique existe
      let entity = await this.uprRepo.findOne({
        where: {
          user: { id: dto.userId },
          platform: { id: assign.platformId },
          role: { id: assign.roleId },
        },
      });

      if (entity) {
        // ⚡ Mise à jour éventuelle si nécessaire
        Object.assign(entity, assign);
        results.push(await this.uprRepo.save(entity));
      } else {
        // Crée une nouvelle assignation
        entity = this.uprRepo.create({ user, platform, role });
        results.push(await this.uprRepo.save(entity));
      }
    }

    return {
      message: `Rôles assignés ou mis à jour avec succès (${results.length})`,
      data: results,
    };
  }

  async findRolesByUser(userId: string) {
    return this.uprRepo.find({
      where: { user: { id: userId } },
      relations: ['role', 'platform'], // ⚡ Ajoute les relations pour récupérer les données complètes
    });
  }

  async remove(id: string) {
    return await this.uprRepo.delete(id);
  }
}
