// src/users/sessions/user-sessions.controller.ts
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { Roles } from 'src/users/utility/decorators/roles.decorator';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditCategory, AuditSeverity } from 'src/audit/enum/audit.enums';
import { UserSessionsService } from './user-sessions.service';
import { MySessionsQueryDto, RevokeSessionDto, SessionsQueryDto } from './sessions.dto';

const sidOf = (req: Request) => ((req as any).currentUser?.sessionId as string | undefined) ?? null;

/**
 * ✅ SESSIONS DE CONNEXION
 *
 *  Utilisateur connecté
 *  POST   /sessions/logout                 déconnexion de cet appareil ({ all: true } = partout)
 *  GET    /sessions/me?all=true            mes appareils connectés (session actuelle en premier)
 *  DELETE /sessions/me/:id                 fermer une de mes sessions
 *  POST   /sessions/me/revoke-others       déconnecter tous mes autres appareils
 *
 *  Administration (ADMIN / SUPER ADMIN)
 *  GET    /sessions                        ?status=active|revoked|expired|all&userId&platform&ip&search&from&to&page&limit
 *  GET    /sessions/stats                  sessions actives, utilisateurs connectés, plateformes, jetons réutilisés
 *  DELETE /sessions/:id                    fermer une session { note? }
 *  POST   /sessions/users/:userId/revoke-all   déconnecter un utilisateur partout { note? }
 */
@ApiTags('Sessions')
@ApiBearerAuth()
@Controller('sessions')
@UseGuards(AuthentificationGuard)
export class UserSessionsController {
  constructor(private readonly sessions: UserSessionsService) {}

  // ---------------- Utilisateur connecté ----------------
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.LOGOUT, 'user_sessions', { category: AuditCategory.SECURITY })
  logout(@Req() req: Request, @CurrentUser() user: UserEntity, @Body('all') all?: boolean | string) {
    return this.sessions.logout(user.id, sidOf(req), all === true || all === 'true', langFrom(req));
  }

  @Get('me')
  mine(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: MySessionsQueryDto) {
    return this.sessions.mine(user.id, sidOf(req), q, langFrom(req));
  }

  @Post('me/revoke-others')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.LOGOUT, 'user_sessions', { category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING })
  revokeOthers(@Req() req: Request, @CurrentUser() user: UserEntity) {
    return this.sessions.revokeOthers(user.id, sidOf(req), langFrom(req));
  }

  @Delete('me/:id')
  @AuditAction(ActionType.LOGOUT, 'user_sessions', { category: AuditCategory.SECURITY })
  revokeMine(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.revokeMine(user.id, id, langFrom(req));
  }

  // ---------------- Administration ----------------
  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  stats(@Req() req: Request) {
    return this.sessions.stats(langFrom(req));
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  list(@Req() req: Request, @Query() q: SessionsQueryDto) {
    return this.sessions.list(q, langFrom(req));
  }

  @Post('users/:userId/revoke-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @AuditAction(ActionType.LOGOUT, 'user_sessions', { category: AuditCategory.SECURITY, severity: AuditSeverity.CRITICAL })
  revokeUser(@Req() req: Request, @CurrentUser() admin: UserEntity, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: RevokeSessionDto) {
    return this.sessions.adminRevokeUser(userId, admin.id, dto?.note, langFrom(req));
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @AuditAction(ActionType.LOGOUT, 'user_sessions', { category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING })
  revoke(@Req() req: Request, @CurrentUser() admin: UserEntity, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevokeSessionDto) {
    return this.sessions.adminRevoke(id, admin.id, dto?.note, langFrom(req));
  }
}
