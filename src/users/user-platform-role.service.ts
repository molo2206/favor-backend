import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPlatformRoleEntity } from './entities/user_plateform_roles.entity';
import { UserEntity } from './entities/user.entity';
import { PlatformEntity } from './entities/plateforms.entity';
import { RoleEntity } from './entities/roles.entity';
import { AssignRoleDto } from './dto/roles_plateforme_user/assign-role.dto';
import { BranchEntity } from 'src/branch/entity/branch.entity';

import { Resource } from 'src/ressource/entity/resource.entity';
import { BranchUserPlatformRoleResourceEntity } from './entities/branch-user-platform-role-resource.entity';

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

    @InjectRepository(BranchEntity)
    private readonly branchRepository: Repository<BranchEntity>,

    @InjectRepository(UserPlatformRoleEntity)
    private readonly userPlatformRoleRepository: Repository<UserPlatformRoleEntity>,

    @InjectRepository(BranchUserPlatformRoleResourceEntity)
    private readonly branchUserPlatformRoleResourceRepository: Repository<BranchUserPlatformRoleResourceEntity>,

    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) {}

  async assignRole(dto: AssignRoleDto) {
    // Vérifie que l'utilisateur existe
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user)
      throw new NotFoundException(
        `Utilisateur avec ID ${dto.userId} introuvable`,
      );

    // Mettre à jour le rôle global si nécessaire
    if (dto.role) {
      user.role = dto.role as any; // si UserRole est enum, faire une conversion
      await this.userRepo.save(user);
    }

    const results: UserPlatformRoleEntity[] = [];

    // Supprimer tous les rôles plateformes existants de l'utilisateur
    const existingRoles = await this.uprRepo.find({
      where: { user: { id: dto.userId } },
    });

    if (existingRoles.length > 0) {
      await this.uprRepo.remove(existingRoles);
    }

    // Si des plateformes sont fournies, on les crée toutes
    if (dto.platforms && dto.platforms.length > 0) {
      for (const assign of dto.platforms) {
        const platform = await this.platformRepo.findOne({
          where: { id: assign.platformId },
        });
        if (!platform)
          throw new NotFoundException(
            `Plateforme avec ID ${assign.platformId} introuvable`,
          );

        const role = await this.roleRepo.findOne({
          where: { id: assign.roleId },
        });
        if (!role)
          throw new NotFoundException(
            `Rôle avec ID ${assign.roleId} introuvable`,
          );

        const entity = this.uprRepo.create({ user, platform, role });
        results.push(await this.uprRepo.save(entity));
      }
    }

    // Recharge l'utilisateur avec relations
    const updatedUser = await this.userRepo.findOne({
      where: { id: dto.userId },
      relations: [
        'userHasCompany',
        'activeCompany',
        'travelReservations',
        'addresses',
        'defaultAddress',
        'orders',
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
    void password;

    return {
      message: `Rôles plateformes réinitialisés et assignés avec succès (${results.length})`,
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

  async assignResourcesToUser(
    userId: string,
    platformId: string,
    roleId: string,
    branchId: string,
    resources: {
      resourceId: string;
      create: boolean;
      update: boolean;
      read: boolean;
      delete: boolean;
      validate: boolean;
    }[],
  ): Promise<{ message: string }> {
    // 1️⃣ Vérifier que l'utilisateur existe
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    // 2️⃣ Vérifier que la plateforme existe
    const platform = await this.platformRepo.findOne({
      where: { id: platformId },
    });
    if (!platform) throw new NotFoundException('Plateforme non trouvée');

    // 3️⃣ Vérifier que le rôle existe
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Rôle non trouvé');

    // 4️⃣ Vérifier que la branche existe
    const branch = await this.branchRepository.findOne({
      where: { id: branchId },
    });
    if (!branch) throw new NotFoundException('Branche non trouvée');

    // 5️⃣ Récupérer ou créer UserPlatformRole
    let userPlatformRole = await this.userPlatformRoleRepository.findOne({
      where: {
        user: { id: userId },
        platform: { id: platformId },
        role: { id: roleId },
      },
    });

    if (!userPlatformRole) {
      userPlatformRole = this.userPlatformRoleRepository.create({
        user,
        platform,
        role,
      });
      userPlatformRole =
        await this.userPlatformRoleRepository.save(userPlatformRole);
    }

    // 6️⃣ Vérifier si une assignation existe déjà pour ce userPlatformRole et branch
    const existingAssignments =
      await this.branchUserPlatformRoleResourceRepository.findOne({
        where: {
          branch: { id: branchId },
          userPlatformRole: { id: userPlatformRole.id },
        },
      });

    if (existingAssignments) {
      throw new BadRequestException(
        'Il existe déjà. Modifiez les permissions existantes au lieu de créer une nouvelle assignation.',
      );
    }

    // 7️⃣ Créer les assignations pour chaque ressource
    const entriesToSave: BranchUserPlatformRoleResourceEntity[] = [];

    for (const res of resources) {
      const resourceEntity = await this.resourceRepository.findOne({
        where: { id: res.resourceId },
      });
      if (!resourceEntity) continue;

      entriesToSave.push(
        this.branchUserPlatformRoleResourceRepository.create({
          branch,
          userPlatformRole,
          resource: resourceEntity,
          create: res.create,
          update: res.update,
          read: res.read,
          delete: res.delete,
          validate: res.validate,
        }),
      );
    }

    if (entriesToSave.length > 0) {
      await this.branchUserPlatformRoleResourceRepository.save(entriesToSave);
    }

    return { message: 'Ressources assignées avec succès' };
  }

  async updateResourcesForUser(
    userPlatformRoleId: string,
    branchId: string,
    resources: {
      resourceId: string;
      create?: boolean;
      update?: boolean;
      read?: boolean;
      delete?: boolean;
      validate?: boolean;
    }[],
  ): Promise<{ message: string; data: any }> {
    // 1️⃣ Vérification des entrées
    if (!userPlatformRoleId)
      throw new BadRequestException('userPlatformRoleId est requis.');
    if (!branchId) throw new BadRequestException('branchId est requis.');

    // 2️⃣ Vérifier si le rôle utilisateur existe
    const userPlatformRole = await this.userPlatformRoleRepository.findOne({
      where: { id: userPlatformRoleId },
      relations: ['user', 'platform', 'role'],
    });
    if (!userPlatformRole)
      throw new NotFoundException('Rôle utilisateur introuvable.');

    // 3️⃣ Vérifier la branche
    const branch = await this.branchRepository.findOne({
      where: { id: branchId },
    });
    if (!branch) throw new NotFoundException('Branche introuvable.');

    // ⚠️ 4️⃣ Supprimer toutes les permissions pour CE ROLE (toutes branches confondues)
    await this.branchUserPlatformRoleResourceRepository
      .createQueryBuilder()
      .delete()
      .from(BranchUserPlatformRoleResourceEntity)
      .where('userPlatformRoleId = :userPlatformRoleId', { userPlatformRoleId })
      .execute();

    // 5️⃣ Créer les nouvelles permissions uniquement pour la branche actuelle
    const newPermissions: BranchUserPlatformRoleResourceEntity[] = [];

    for (const r of resources) {
      const resourceEntity = await this.resourceRepository.findOne({
        where: { id: r.resourceId },
      });
      if (!resourceEntity) continue;

      const newPermission =
        this.branchUserPlatformRoleResourceRepository.create({
          branch,
          userPlatformRole,
          resource: resourceEntity,
          create: r.create ?? false,
          read: r.read ?? true,
          update: r.update ?? false,
          delete: r.delete ?? false,
          validate: r.validate ?? false,
        });

      newPermissions.push(newPermission);
    }

    await this.branchUserPlatformRoleResourceRepository.save(newPermissions);

    // 6️⃣ Recharger les permissions créées
    const updatedPermissions =
      await this.branchUserPlatformRoleResourceRepository.find({
        where: { userPlatformRole: { id: userPlatformRoleId } },
        relations: [
          'resource',
          'branch',
          'userPlatformRole',
          'userPlatformRole.user',
          'userPlatformRole.role',
          'userPlatformRole.platform',
        ],
      });

    // 7️⃣ Format identique à findAllPermissions()
    const data = {
      id: userPlatformRole.id,
      user: userPlatformRole.user
        ? {
            id: userPlatformRole.user.id,
            fullName: userPlatformRole.user.fullName,
            email: userPlatformRole.user.email,
            phone: userPlatformRole.user.phone,
          }
        : null,
      platform: userPlatformRole.platform,
      role: userPlatformRole.role,
      branch,
      resources: updatedPermissions.map((perm) => ({
        resource: {
          id: perm.resource.id,
          label: perm.resource.label,
          value: perm.resource.description,
          status: perm.resource.status,
          deleted: perm.resource.deleted,
          createdAt: perm.resource.createdAt,
          updatedAt: perm.resource.updatedAt,
        },
        id: perm.resource.id,
        create: perm.create,
        read: perm.read,
        update: perm.update,
        delete: perm.delete,
        validate: perm.validate,
        createdAt: perm.createdAt,
      })),
    };

    return {
      message: 'Permissions mises à jour sans duplication.',
      data,
    };
  }

  async findAllPermissions(): Promise<{ message: string; data: any[] }> {
    const rolesWithPermissions = await this.userPlatformRoleRepository.find({
      relations: [
        'user',
        'platform',
        'role',
        'branchUserPlatformRoleResources',
        'branchUserPlatformRoleResources.branch',
        'branchUserPlatformRoleResources.resource',
      ],
      order: { createdAt: 'ASC' },
    });

    const data = rolesWithPermissions.flatMap((upr) => {
      const branchMap = new Map<string, any>();

      upr.branchUserPlatformRoleResources?.forEach((perm) => {
        const branchId = perm.branch?.id ?? 'no-branch'; // si branch est null
        if (!branchMap.has(branchId)) {
          branchMap.set(branchId, {
            id: upr.id,
            user: upr.user
              ? {
                  id: upr.user.id,
                  fullName: upr.user.fullName,
                  email: upr.user.email,
                  phone: upr.user.phone,
                }
              : null,
            platform: upr.platform,
            role: upr.role,
            branch: perm.branch ?? null,
            resources: [],
          });
        }

        branchMap.get(branchId).resources.push({
          resource: {
            id: perm.resource.id,
            label: perm.resource.label,
            value: perm.resource.name,
            status: perm.resource.status,
            deleted: perm.resource.deleted,
            createdAt: perm.resource.createdAt,
            updatedAt: perm.resource.updatedAt,
          },
          id: perm.resource.id,
          create: perm.create,
          read: perm.read,
          update: perm.update,
          delete: perm.delete,
          validate: perm.validate,
          createdAt: perm.createdAt,
        });
      });

      return Array.from(branchMap.values());
    });

    return {
      message:
        data.length === 0
          ? 'Aucune permission trouvée.'
          : 'Liste des permissions récupérée avec succès.',
      data,
    };
  }

  async findOnePermission(
    userPlatformRoleId: string,
    branchId?: string, // facultatif
  ): Promise<{ message: string; data: any }> {
    const upr = await this.userPlatformRoleRepository.findOne({
      where: { id: userPlatformRoleId },
      relations: [
        'user',
        'platform',
        'role',
        'branchUserPlatformRoleResources',
        'branchUserPlatformRoleResources.branch',
        'branchUserPlatformRoleResources.resource',
      ],
    });

    if (!upr) {
      return { message: 'Aucune permission trouvée.', data: null };
    }

    // Filtrer uniquement les ressources avec une branche
    const branchPermissions = upr.branchUserPlatformRoleResources?.filter(
      (perm) => !!perm.branch && (!branchId || perm.branch.id === branchId),
    );

    if (!branchPermissions || branchPermissions.length === 0) {
      return {
        message: branchId
          ? 'Aucune permission trouvée pour cette branche.'
          : 'Aucune permission trouvée.',
        data: null,
      };
    }

    // Prendre la première branche correspondante
    const branch = branchPermissions[0].branch!;

    const data = {
      id: upr.id,
      user: upr.user
        ? {
            id: upr.user.id,
            fullName: upr.user.fullName,
            email: upr.user.email,
            phone: upr.user.phone,
          }
        : null,
      platform: upr.platform,
      role: upr.role,
      branch,
      resources: branchPermissions.map((perm) => ({
        resource: {
          id: perm.resource.id,
          label: perm.resource.label,
          value: perm.resource.name,
          status: perm.resource.status,
          deleted: perm.resource.deleted,
          createdAt: perm.resource.createdAt,
          updatedAt: perm.resource.updatedAt,
        },
        id: perm.resource.id,
        create: perm.create,
        read: perm.read,
        update: perm.update,
        delete: perm.delete,
        validate: perm.validate,
        createdAt: perm.createdAt,
      })),
    };

    return {
      message: 'Permissions récupérées avec succès.',
      data,
    };
  }
}
