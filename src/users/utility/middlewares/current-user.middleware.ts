/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-namespace */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { verify } from 'jsonwebtoken';
import { UsersService } from 'src/users/users.service';
import { JwtPayload } from 'src/users/interfaces/jwt-payload.interface';
import { ConfigService } from '@nestjs/config';
import { VehicleType } from '../common/user-vehiculetype.enum';

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
      } | null;
    }

  }
}

@Injectable()
export class CurrentUserMiddleware implements NestMiddleware {
  constructor(private readonly usersService: UsersService, private readonly configService: ConfigService,) { }

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
        throw new Error('ACCESS_TOKEN_SECRET_KEY is not defined in your environment variables');
      }
      const payload = verify(token, secretKey) as unknown as JwtPayload;

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
        address: user.data.address,
        preferredLanguage: user.data.preferredLanguage,
        loyaltyPoints: user.data.loyaltyPoints,
        dateOfBirth: user.data.dateOfBirth,
        vehicleType: user.data.vehicleType,
        plateNumber: user.data.plateNumber,
        activeCompanyId: user.data.activeCompanyId,
        role
      };
    } catch (err) {
      req.currentUser = null;
    }

    return next();
  }
}
