import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/** Rôles qui ont accès à tout ce qui est réservé à l'ADMIN */
const SUPER_ROLES = ['SUPER ADMIN', 'SUPER_ADMIN'];

/**
 * ✅ Vérifie le rôle de l'utilisateur connecté pour les routes @Roles(...).
 *
 * Correctif : l'utilisateur a un rôle unique `role` (colonne users.role) ; l'ancienne version ne lisait
 * que `roles` (tableau, absent) et renvoyait « Utilisateur non authentifié » à un admin connecté.
 * - pas d'utilisateur            → 401 (non connecté)
 * - connecté sans le bon rôle    → 403 (accès refusé) : le front ne déconnecte plus l'utilisateur
 * - SUPER ADMIN                  → accès à toutes les routes ADMIN
 */
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

        if (!user) {
            throw new UnauthorizedException('Utilisateur non authentifié.');
        }

        // Rôle unique (users.role) + éventuel tableau de rôles
        const userRoles: string[] = [
            user.role,
            ...(Array.isArray(user.roles) ? user.roles : []),
        ]
            .filter(Boolean)
            .map((r: any) => String(r).toUpperCase().trim());

        if (!userRoles.length) {
            throw new ForbiddenException('Accès refusé : aucun rôle attribué à cet utilisateur.');
        }

        const required = requiredRoles.map((r) => String(r).toUpperCase().trim());
        const isSuper = userRoles.some((r) => SUPER_ROLES.includes(r));
        const hasRole =
            userRoles.some((r) => required.includes(r)) ||
            (isSuper && required.includes('ADMIN'));

        if (!hasRole) {
            throw new ForbiddenException(
                `Accès refusé. Rôle requis : ${requiredRoles.join(', ')}.`,
            );
        }

        return true;
    }
}
