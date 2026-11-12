// src/users/current-user.middleware.ts

import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
  Optional,
} from '@nestjs/common';
import { UserSessionsService } from 'src/users/sessions/user-sessions.service';
import { WorkSchedulesService } from 'src/work-schedules/work-schedules.service';
import { requestLang } from 'src/common/errors/message-translator';
import { currentAudit } from 'src/audit/context/audit-context';
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
        userIdFpay?: string;  // ✅ AJOUTER
        isLink?: boolean;     // ✅ AJOUTER
        sessionId?: string | null; // ✅ Session de connexion du jeton
      } | null;
    }
  }
}

@Injectable()
export class CurrentUserMiddleware implements NestMiddleware {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    @Optional() private readonly sessions?: UserSessionsService,
    @Optional() private readonly workSchedules?: WorkSchedulesService,
  ) { }

  /** Routes accessibles même en dehors des horaires de travail (déconnexion, consultation de son programme) */
  private static readonly OUTSIDE_HOURS_ALLOWED = [/\/sessions\/logout\/?$/, /\/work-schedules\/me\/?$/];

  async use(req: Request, res: Response, next: NextFunction) {
    const rawAuthHeader = req.headers.authorization || req.headers.Authorization;
    const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;

    if (!authHeader?.startsWith('Bearer ')) {
      req.currentUser = null;
      return next();
    }

    const token = authHeader.split(' ')[1];

    try {
      const secretKey = this.configService.get<string>('ACCESS_TOKEN_SECRET_KEY');
      if (!secretKey) throw new Error('ACCESS_TOKEN_SECRET_KEY is not defined');

      const payload = verify(token, secretKey) as JwtPayload;

      // ✅ Session fermée (déconnexion, autre appareil, admin, mot de passe changé…) → jeton refusé
      const sid = typeof payload.sid === 'string' ? payload.sid : null;
      if (sid && this.sessions && !(await this.sessions.isActive(sid, payload.id))) {
        req.currentUser = null;
        return next();
      }

      // ✅ Requête légère (colonnes utiles + statut de l'entreprise active) au lieu de findOne() et ses ~15 jointures
      const user = await this.usersService.findForAuth(payload.id);

      if (!user) {
        req.currentUser = null;
        return next();
      }

      if (!user.isActive) {
        throw new ForbiddenException('Votre compte est désactivé');
      }

      const role = Array.isArray(payload.role) ? payload.role[0] : payload.role;

      // ✅ Attacher l'utilisateur avec userIdFpay et isLink
      req.currentUser = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        image: user.image,
        isActive: user.isActive,
        country: user.country,
        city: user.city,
        preferredLanguage: user.preferredLanguage,
        loyaltyPoints: user.loyaltyPoints,
        dateOfBirth: user.dateOfBirth,
        vehicleType: user.vehicleType,
        plateNumber: user.plateNumber,
        activeCompanyId: user.activeCompanyId,
        defaultAddressId: user.defaultAddressId,
        role,
        companyStatus: user.companyStatus,
        userIdFpay: user.userIdFpay,  // ✅ AJOUTER
        isLink: user.isLink,           // ✅ AJOUTER
        sessionId: sid,
      };
      if (sid) {
        const store = currentAudit();
        if (store) store.sessionId = sid;
        this.sessions?.touch(sid);
      }

      // ✅ Horaires de travail : Super Admin > dérogation > programme individuel > programme de l'entreprise
      if (this.workSchedules) {
        const decision = await this.workSchedules.decide({ id: user.id, role, activeCompanyId: user.activeCompanyId });
        if (!decision.allowed) {
          const path = String(req.originalUrl || req.url || '').split('?')[0];
          if (!CurrentUserMiddleware.OUTSIDE_HOURS_ALLOWED.some((re) => re.test(path))) {
            throw this.workSchedules.denial(decision, requestLang(req));
          }
        }
      }
    } catch (err) {
      if (err instanceof TokenExpiredError || err instanceof JsonWebTokenError) {
        req.currentUser = null;
      } else {
        throw err;
      }
    }

    return next();
  }
}