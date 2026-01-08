import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserEntity } from 'src/users/entities/user.entity';
import { DataSource } from 'typeorm';
import { PERMISSION_METADATA } from '../decorators/permissions.decorator';
import { BranchUserPlatformRoleResourceEntity } from 'src/users/entities/branch-user-platform-role-resource.entity';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Récupérer les permissions requises depuis le décorateur
    const requiredPermissions = this.reflector.getAllAndOverride(PERMISSION_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions) return true;

    const request = context.switchToHttp().getRequest();
    const user: UserEntity = request.user;
    const branchId = request.headers['branch-id']; // Tu peux le passer dans le header

    if (!user) throw new UnauthorizedException('Utilisateur non authentifié');
    if (!branchId) throw new ForbiddenException('Branch ID manquant');

    const { resource, action } = requiredPermissions;

    // 🔍 Vérifie si l'utilisateur possède la permission demandée
    const repo = this.dataSource.getRepository(BranchUserPlatformRoleResourceEntity);

    const permission = await repo
      .createQueryBuilder('perm')
      .leftJoin('perm.userPlatformRole', 'upr')
      .leftJoin('upr.user', 'user') 
      .leftJoin('perm.resource', 'resource')
      .where('user.id = :userId', { userId: user.id })
      .andWhere('perm.branch = :branchId', { branchId })
      .andWhere('resource.key = :resourceKey', { resourceKey: resource })
      .getOne();

    if (!permission || !permission[action]) {
      throw new ForbiddenException(
        `Accès refusé : vous n’avez pas la permission "${action}" sur "${resource}".`,
      );
    }

    return true;
  }
}
