import { Injectable, NestMiddleware } from '@nestjs/common';
import { isArray } from 'class-validator';
import { Request, Response, NextFunction } from 'express';
import { verify } from 'jsonwebtoken';
import { UsersService } from '../../users.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentUser?: any;
    }
  }
}

@Injectable()
export class CurrentUserMiddleware implements NestMiddleware {
  constructor(private readonly usersService: UsersService) { }

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const authHeader =
        req?.headers?.authorization || req.headers.Authorization;

      if (
        !authHeader ||
        isArray(authHeader) ||
        !authHeader.startsWith('Bearer ')
      ) {
        req.currentUser = null;
        next();
        return;
      } else {
        try {
          const token = authHeader.split(' ')[1];
          const secretKey = process.env.ACCESS_TOKEN_SECRET_KEY as string;
          const { id } = <JwtPayload>verify(token, secretKey);
          const currentUser = await this.usersService.findOne(id);
          req.currentUser = currentUser;
          return next();
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
          req.currentUser = null;
          return next();
        }
      }
    } catch (error) {
      console.error("Erreur d'authentification:", error);
      req.currentUser = null;
    }
    return next();
  }
}
interface JwtPayload {
  id: string;
}
