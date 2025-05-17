/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-namespace */
import { ForbiddenException, Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TokenExpiredError, verify } from 'jsonwebtoken';
import { UsersService } from 'src/users/users.service';
import { JwtPayload } from 'src/users/interfaces/jwt-payload.interface';
import { ConfigService } from '@nestjs/config';
import { VehicleType } from '../../enum/user-vehiculetype.enum';
import { JsonWebTokenError } from '@nestjs/jwt';

declare global {
  namespace Express {
    interface Request {
      currentUser?: {
        id: string;
        email: string;
        fullName?: string;
        phone?: string;
        role: string;
        image: string;
        isActive: boolean;
        country?: string;
        city?: string;
        address?: string;
        preferredLanguage?: string;
        loyaltyPoints?: number;
        dateOfBirth?: Date;
        vehicleType?: string;
        plateNumber?: string;
        activeCompanyId?: string;
        defaultAddressId?: string;
      } | null;
    }

  }
}

@Injectable()
export class CurrentUserMiddleware implements NestMiddleware {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const rawAuthHeader = req.headers.authorization || req.headers.Authorization;
    const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.currentUser = null;
      return next();
    }

    const token = authHeader.split(' ')[1];

    try {
      const secretKey = this.configService.get<string>('ACCESS_TOKEN_SECRET_KEY');
      if (!secretKey) {
        throw new Error('ACCESS_TOKEN_SECRET_KEY is not defined in env');
      }

      const payload = verify(token, secretKey) as JwtPayload;

      const user = await this.usersService.findOne(payload.id);
      if (!user) {
        req.currentUser = null;
        return next();
      }

      const role = Array.isArray(payload.role) ? payload.role[0] : payload.role;

      req.currentUser = {
        id: user.data.id,
        fullName: user.data.fullName,
        email: user.data.email,
        phone: user.data.phone,
        image: user.data.image,
        isActive: user.data.isActive,
        country: user.data.country,
        city: user.data.city,
        preferredLanguage: user.data.preferredLanguage,
        loyaltyPoints: user.data.loyaltyPoints,
        dateOfBirth: user.data.dateOfBirth,
        vehicleType: user.data.vehicleType,
        plateNumber: user.data.plateNumber,
        activeCompanyId: user.data.activeCompanyId,
        defaultAddressId: user.data.defaultAddressId,
        role,
      };
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw new ForbiddenException('Token expiré. Veuillez vous reconnecter.');
      } else if (err instanceof JsonWebTokenError) {
        throw new UnauthorizedException('Token invalide.');
      }

      // cas générique (ex: erreur de vérification inconnue)
      throw new UnauthorizedException('Erreur d’authentification.');
    }

    return next();
  }
}
