import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredRoles || requiredRoles.length === 0) {
            return true; // Aucun rôle requis → accès autorisé
        }

        const request = context.switchToHttp().getRequest();
        const user = request.currentUser;

        if (!user || !user.roles) {
            throw new UnauthorizedException('Utilisateur non authentifié ou rôles manquants.');
        }

        const hasRole = user.roles.some((role: string) =>
            requiredRoles.includes(role),
        );

        if (!hasRole) {
            throw new UnauthorizedException(
                `Accès refusé. Rôle requis: ${requiredRoles.join(', ')}.`,
            );
        }

        return true;
    }
}
