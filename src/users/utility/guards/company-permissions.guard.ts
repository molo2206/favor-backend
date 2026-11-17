// company-permissions.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';

import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { PERMISSION_METADATA } from '../decorators/permissions.decorator';
import { Permission } from './permissions.guard';

@Injectable()
export class CompanyPermissionsGuard implements CanActivate {
  private readonly bypassRoles = [UserRole.SUPER_ADMIN];

  constructor(
    private reflector: Reflector,
    private dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: UserEntity = request.user;

    if (!user) throw new UnauthorizedException('Utilisateur non authentifié');

    if (this.bypassRoles.includes(user.role)) return true;

    const companyId = user.activeCompanyId;
    const branchId = user.activeBranchId;

    if (!companyId) throw new ForbiddenException('Aucune entreprise active');
    if (!branchId) throw new ForbiddenException('Aucune branche active');

    // Vérifier que l'utilisateur appartient bien à l'entreprise
    const userCompanyRepo = this.dataSource.getRepository(UserHasCompanyEntity);
    const userCompany = await userCompanyRepo.findOne({
      where: { user: { id: user.id }, company: { id: companyId } },
    });
    if (!userCompany) {
      throw new ForbiddenException("Vous n'appartenez pas à cette entreprise");
    }

    // Pour chaque permission requise, vérifier l'existence et les droits
    for (const perm of requiredPermissions) {
      await this.checkSinglePermission(
        userCompany.id,
        branchId,
        perm.resource,
        perm.action,
      );
    }

    return true;
  }

  private async checkSinglePermission(
    userCompanyId: string,
    branchId: string,
    resourceKey: string,
    action: string,
  ): Promise<void> {
    const permRepo = this.dataSource.getRepository(CompanyHasUserResource);
    const permission = await permRepo
      .createQueryBuilder('perm')
      .leftJoin('perm.userCompany', 'userCompany')
      .leftJoin('perm.resource', 'resource')
      .where('userCompany.id = :userCompanyId', { userCompanyId })
      .andWhere('resource.key = :resourceKey', { resourceKey })
      .andWhere('perm.branchId = :branchId', { branchId })
      .getOne();

    if (!permission) {
      throw new ForbiddenException(
        `Aucune permission pour la ressource "${resourceKey}" dans cette branche.`,
      );
    }

    // canManage donne tous les droits
    if (permission.canManage) return;

    const allowed =
      (action === 'canCreate' && permission.canCreate) ||
      (action === 'canRead' && permission.canRead) ||
      (action === 'canUpdate' && permission.canUpdate) ||
      (action === 'canDelete' && permission.canDelete);

    if (!allowed) {
      throw new ForbiddenException(
        `Action "${action}" non autorisée sur la ressource "${resourceKey}".`,
      );
    }
  }
}
