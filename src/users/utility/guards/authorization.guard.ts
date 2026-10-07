// src/auth/guards/authorize.guard.ts
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
  } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
  
  @Injectable()
  export class AuthorizeGuard implements CanActivate {
    constructor(private reflector: Reflector) {}
  
    canActivate(context: ExecutionContext): boolean {
      const allowedRoles = this.reflector.get<string[]>(
        'allowedRoles',
        context.getHandler(),
      );
  
      if (!allowedRoles || allowedRoles.length === 0) {
        return true; // Pas de rôles requis = accès autorisé
      }
  
      const request = context.switchToHttp().getRequest();
      const user = request.currentUser;
  
      if (!user || !user.role) {
        throw new UnauthorizedException('Utilisateur non authentifié ou rôle manquant.');
      }
  
      if (!allowedRoles.includes(user.role)) {
        throw new UnauthorizedException(`Accès refusé pour le rôle : ${user.role}`);
      }
  
      return true;
    }
  }
  