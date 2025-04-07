
import { CanActivate, ExecutionContext, UnauthorizedException, mixin } from '@nestjs/common';

export const AuthorizeGuard = (allowedRoles: string[]) => {
    class RolesGuardMixin implements CanActivate {
        canActivate(context: ExecutionContext): boolean {
            const request = context.switchToHttp().getRequest();
            const userRoles = request.currentUser?.roles;

            // Si aucun rôle n'est requis pour cet endpoint, autoriser l'accès
            if (!allowedRoles || allowedRoles.length === 0) {
                return true; // Aucun rôle spécifié = accès autorisé
            }

            if (!userRoles || !Array.isArray(userRoles) || userRoles.length === 0) {
                throw new UnauthorizedException('Accès refusé : aucun rôle détecté.');
            }

            // Vérifie si AU MOINS un rôle de l'utilisateur est autorisé
            const hasPermission = userRoles.some((role: string) => allowedRoles.includes(role));

            if (!hasPermission) {
                throw new UnauthorizedException(
                    `Désolé, vous n’êtes pas autorisé. Vos rôles: ${userRoles.join(', ')}`
                );
            }

            return true; // L'utilisateur a les rôles nécessaires
        }
    }

    // Créer et retourner le garde sous forme de mixin
    const guard = mixin(RolesGuardMixin);
    return guard;
};
