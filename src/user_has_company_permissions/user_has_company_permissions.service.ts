import { Injectable } from '@nestjs/common';
import { CreateUserHasPermissionDto } from './dto/create-user_has_company_permission.dto';
import { UpdateUserHasCompanyPermissionDto } from './dto/update-user_has_company_permission.dto';
import { UserHasCompanyPermissionEntity } from './entities/user_has_company_permission.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PermissionEntity } from 'src/permissions/entities/permission.entity';

@Injectable()
export class UserHasCompanyPermissionService {
  constructor(
    @InjectRepository(UserHasCompanyPermissionEntity)
    private permissionRepo: Repository<UserHasCompanyPermissionEntity>,
    @InjectRepository(UserHasCompanyEntity)
    private userHasCompanyRepository: Repository<UserHasCompanyEntity>,
    @InjectRepository(PermissionEntity)
    private permissionRepository: Repository<PermissionEntity>,

    @InjectRepository(UserHasCompanyPermissionEntity)
    private userHasCompanyPermissionEntity: Repository<UserHasCompanyPermissionEntity>,

  ) { }

  async assignPermissionsToUserCompany(dto: CreateUserHasPermissionDto) {
    // Vérifier si l'association UserHasCompany existe
    const userHasCompany = await this.userHasCompanyRepository.findOneOrFail({
      where: { id: dto.userHasCompanyId },
      relations: [
        'user', // Récupérer l'utilisateur lié à l'association
        'company', // Récupérer l'organisation liée à l'association
        'permissions',  // Permet de récupérer toutes les permissions associées à l'utilisateur
        'permissions.permission' // Détails de chaque permission
      ]
    });

    // Vérifier si la permission existe
    const permission = await this.permissionRepository.findOneOrFail({
      where: { id: dto.permissionId },
    });

    // Vérifier si la permission est déjà attribuée à cette entreprise et utilisateur
    let userHasPermission = await this.userHasCompanyPermissionEntity.findOne({
      where: {
        userHasCompany: { id: dto.userHasCompanyId },
        permission: { id: dto.permissionId },
      },
    });

    if (userHasPermission) {
      // Si l'association existe, mettre à jour les permissions
      userHasPermission.create = dto.actions.create;
      userHasPermission.read = dto.actions.read;
      userHasPermission.update = dto.actions.update;
      userHasPermission.delete = dto.actions.delete;
      userHasPermission.status = dto.actions.status;

      // Sauvegarder les modifications
      await this.userHasCompanyPermissionEntity.save(userHasPermission);
    } else {
      // Sinon, créer une nouvelle entrée
      userHasPermission = this.userHasCompanyPermissionEntity.create({
        userHasCompany,
        permission,
        create: dto.actions.create,
        read: dto.actions.read,
        update: dto.actions.update,
        delete: dto.actions.delete,
        status: dto.actions.status,
      });

      // Sauvegarder la nouvelle permission
      await this.userHasCompanyPermissionEntity.save(userHasPermission);
    }

    // Après avoir créé ou mis à jour la permission, récupérer les informations et structurer la réponse
    const fullUserPermission = await this.userHasCompanyPermissionEntity.findOne({
      where: { id: userHasPermission.id },
      relations: [
        'userHasCompany', // Récupérer les informations de UserHasCompany
        'userHasCompany.user', // Récupérer l'utilisateur lié à l'association
        'userHasCompany.company', // Récupérer la company liée à l'association
        'userHasCompany.permissions', // Ajouter les permissions de l'association
        'userHasCompany.permissions.permission' // Extraire les détails des permissions
      ]
    });

    if (!fullUserPermission) {
      throw new Error('UserHasCompanyPermissionEntity not found after save');
    }

    const userHasCompanyData = fullUserPermission.userHasCompany;

    // Structurer la réponse comme souhaitée
    return {
      user: {
        id: userHasCompanyData.user?.id,
        name: userHasCompanyData.user?.fullName, // Assurez-vous que le nom de l'utilisateur est dans fullName
        email: userHasCompanyData.user?.email,
        createdAt: userHasCompanyData.user?.createdAt,
        updatedAt: userHasCompanyData.user?.updatedAt,
        userHasCompany: [
          {
            id: userHasCompanyData.id,
            isOwner: userHasCompanyData.isOwner,
            company: userHasCompanyData.company,
             
            permissions: userHasCompanyData.permissions?.map(permission => ({
              id: permission.permission.id,
              name: permission.permission.name,
              create: permission.create,
              update: permission.update,
              delete: permission.delete,
              read: permission.read,
              status: permission.status,
              createdAt: permission.permission.createdAt,
              updatedAt: permission.permission.updatedAt,
            })) ?? [],
          },
        ],
      },
    };
  }

  async findAll() {
    return this.permissionRepo.find();
  }

  async findOne(id: string) {
    return this.permissionRepo.findOneByOrFail({ id });
  }

  async update(id: string, dto: UpdateUserHasCompanyPermissionDto) {
    const permission = await this.permissionRepo.findOneByOrFail({ id });

    Object.assign(permission, dto);

    return this.permissionRepo.save(permission);
  }

  async remove(id: string) {
    return this.permissionRepo.delete(id);
  }
}