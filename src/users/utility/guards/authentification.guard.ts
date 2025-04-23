
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedRequest } from '../common/authenticated-request.interface';

@Injectable()
export class AuthentificationGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

        if (!request.currentUser) {
            throw new UnauthorizedException('Accès non autorisé. Veuillez vous connecter.');
        }
        return true;
    }
}

