import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPlatformRoleEntity } from './entities/user_plateform_roles.entity';
import { UserEntity } from './entities/user.entity';
import { PlatformEntity } from './entities/plateforms.entity';
import { RoleEntity } from './entities/roles.entity';
import { AssignRoleDto } from './dto/roles_plateforme_user/assign-role.dto';

interface AssignmentDto {
  platformId: string;
  roleId: string;
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
    // Vérifie que l'utilisateur existe
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException(`Utilisateur avec ID ${dto.userId} introuvable`);

    // Mettre à jour le rôle global si nécessaire
    if (dto.role) {
      user.role = dto.role as any; // si UserRole est enum, faire une conversion
      await this.userRepo.save(user);
    }

    const results: UserPlatformRoleEntity[] = [];

    // Si platforms est fourni, on les traite
    if (dto.platforms && dto.platforms.length > 0) {
      for (const assign of dto.platforms) {
        const platform = await this.platformRepo.findOne({ where: { id: assign.platformId } });
        if (!platform)
          throw new NotFoundException(`Plateforme avec ID ${assign.platformId} introuvable`);

        const role = await this.roleRepo.findOne({ where: { id: assign.roleId } });
        if (!role) throw new NotFoundException(`Rôle avec ID ${assign.roleId} introuvable`);

        let entity = await this.uprRepo.findOne({
          where: {
            user: { id: dto.userId },
            platform: { id: assign.platformId },
            role: { id: assign.roleId },
          },
        });

        if (entity) {
          Object.assign(entity, assign);
          results.push(await this.uprRepo.save(entity));
        } else {
          entity = this.uprRepo.create({ user, platform, role });
          results.push(await this.uprRepo.save(entity));
        }
      }
    }

    // 🔄 Recharger l'utilisateur avec toutes les relations souhaitées
    const updatedUser = await this.userRepo.findOne({
      where: { id: dto.userId },
      relations: [
        'userHasCompany',
        'activeCompany',
        'travelReservations',
        'addresses',
        'defaultAddress',
        'orders',
        'rentalContracts',
        'saleTransactions',
        'bookings',
        'userPlatformRoles',
        'userPlatformRoles.platform',
        'userPlatformRoles.role',
      ],
    });

    if (!updatedUser) {
      throw new NotFoundException(
        `Utilisateur avec ID ${dto.userId} introuvable après mise à jour`,
      );
    }

    // Supprimer le mot de passe avant retour
    const { password, ...rest } = updatedUser;

    return {
      message: `Rôles assignés ou mis à jour avec succès (${results.length})`,
      data: rest,
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
