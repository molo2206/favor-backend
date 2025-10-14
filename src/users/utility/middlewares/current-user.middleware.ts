import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { verify, TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { UsersService } from 'src/users/users.service';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from 'src/users/interfaces/jwt-payload.interface';
import { CompanyStatus } from 'src/company/enum/company-status.enum';

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
        companyStatus?: CompanyStatus;
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

    if (!authHeader?.startsWith('Bearer ')) {
      req.currentUser = null;
      return next();
    }

    const token = authHeader.split(' ')[1];

    try {
      // Vérifier la présence de la clé secrète
      const secretKey = this.configService.get<string>('ACCESS_TOKEN_SECRET_KEY');
      if (!secretKey) throw new Error('ACCESS_TOKEN_SECRET_KEY is not defined');

      // Vérifier et décoder le token
      const payload = verify(token, secretKey) as JwtPayload;

      // Récupérer l'utilisateur
      const user = await this.usersService.findOne(payload.id);

      if (!user) {
        req.currentUser = null;
        return next();
      }

      // Vérifier si l'utilisateur est actif
      if (!user.data.isActive) {
        throw new ForbiddenException('Votre compte est désactivé');
      }

      // Déterminer le rôle
      const role = Array.isArray(payload.role) ? payload.role[0] : payload.role;

      // Déterminer le statut de la société active
      const companyStatus =
        user.data.activeCompanyId && user.data.activeCompany
          ? user.data.activeCompany.status
          : undefined;

      // Attacher l'utilisateur à la requête
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
        companyStatus,
      };
    } catch (err) {
      // En cas de token invalide ou expiré
      if (err instanceof TokenExpiredError || err instanceof JsonWebTokenError) {
        req.currentUser = null;
      } else {
        throw err; // Propager les autres erreurs (ex. ForbiddenException)
      }
    }

    return next();
  }
}
