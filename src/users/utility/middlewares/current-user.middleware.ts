/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-namespace */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { verify } from 'jsonwebtoken';
import { UsersService } from 'src/users/users.service';
import { JwtPayload } from 'src/users/interfaces/jwt-payload.interface';

declare global {
  namespace Express {
    interface Request {
      currentUser?: {
        id: string;
        email: string;
        name?: string;
        role: string;
      } | null;
    }
  }
}

@Injectable()
export class CurrentUserMiddleware implements NestMiddleware {
  constructor(private readonly usersService: UsersService) { }

  async use(req: Request, res: Response, next: NextFunction) {
    const rawAuthHeader = req.headers.authorization || req.headers.Authorization;
    const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.currentUser = null;
      return next();
    }

    const token = authHeader.split(' ')[1];

    try {
      const secretKey = process.env.ACCESS_TOKEN_EXPIRE_TIME || '1h' as string;
      const payload = verify(token, secretKey) as JwtPayload;

      const user = await this.usersService.findOne(payload.id);

      if (!user) {
        req.currentUser = null;
        return next();
      }
      const role = Array.isArray(payload.role) ? payload.role[0] : payload.role;

      req.currentUser = {
        id: user.id,
        email: user.email,
        name: user.fullName,
        role
      };
    } catch (err) {
      req.currentUser = null;
    }

    return next();
  }
}
