// src/work-schedules/work-schedules.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditCategory, AuditSeverity } from 'src/audit/enum/audit.enums';
import { WorkSchedulesService } from './work-schedules.service';
import {
  BulkUserScheduleDto,
  CheckAccessQueryDto,
  CompaniesOverviewQueryDto,
  CompanyQueryDto,
  CreateExceptionDto,
  ExceptionsQueryDto,
  RevokeExceptionDto,
  ScheduleUsersQueryDto,
  UpsertWorkScheduleDto,
} from './work-schedules.dto';

/**
 * ✅ HORAIRES ET PROGRAMMES DE TRAVAIL
 *
 *  Utilisateur connecté
 *  GET    /work-schedules/me                         règle appliquée, plages, dérogations (accessible même hors horaires)
 *
 *  Entreprise (propriétaire, permission WORK_SCHEDULES, ou Super Admin avec ?companyId=)
 *  GET    /work-schedules/company                    programme de l'entreprise
 *  PUT    /work-schedules/company                    créer / modifier { name, timezone, isActive, graceMinutes, applyToOwners, validFrom, validUntil, notes, slots[] }
 *  DELETE /work-schedules/company                    supprimer (accès libre si aucun programme)
 *
 *  GET    /work-schedules/users                      utilisateurs + règle appliquée ?search&filter=all|individual|company|exception|allowed|blocked&page&limit
 *  POST   /work-schedules/users/bulk                 même programme individuel pour plusieurs utilisateurs { userIds[], ... }
 *  GET    /work-schedules/users/:userId              programme individuel + décision actuelle
 *  PUT    /work-schedules/users/:userId              créer / modifier le programme individuel
 *  DELETE /work-schedules/users/:userId              supprimer (retour au programme de l'entreprise)
 *
 *  GET    /work-schedules/exceptions                 dérogations ?userId&status=active|upcoming|valid|expired|revoked|all
 *  POST   /work-schedules/exceptions                 accorder une dérogation { userId, startsAt, endsAt, reason }
 *  POST   /work-schedules/exceptions/:id/revoke      annuler une dérogation { reason? }
 *
 *  GET    /work-schedules/check?userId&at            simulation : accès autorisé à cet instant ?
 *
 *  Super Admin
 *  GET    /work-schedules/companies                  vue d'ensemble de toutes les entreprises ?search&page&limit
 *  (+ toutes les routes ci-dessus avec ?companyId= ou companyId dans le corps ; isLocked pour verrouiller)
 */
@ApiTags('Horaires de travail')
@ApiBearerAuth()
@Controller('work-schedules')
@UseGuards(AuthentificationGuard)
export class WorkSchedulesController {
  constructor(private readonly service: WorkSchedulesService) {}

  // ---------------- Utilisateur connecté ----------------
  @Get('me')
  me(@Req() req: Request, @CurrentUser() user: UserEntity) {
    return this.service.me(user, langFrom(req));
  }

  // ---------------- Super Admin ----------------
  @Get('companies')
  companies(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompaniesOverviewQueryDto) {
    return this.service.companiesOverview(user, q, langFrom(req));
  }

  // ---------------- Programme de l'entreprise ----------------
  @Get('company')
  getCompany(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompanyQueryDto) {
    return this.service.getCompany(user, q, langFrom(req));
  }

  @Put('company')
  @AuditAction(ActionType.CONFIG_CHANGE, 'work_schedules', { category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING })
  upsertCompany(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: UpsertWorkScheduleDto) {
    return this.service.upsertCompany(user, dto, langFrom(req));
  }

  @Delete('company')
  @AuditAction(ActionType.DELETE, 'work_schedules', { category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING })
  removeCompany(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CompanyQueryDto) {
    return this.service.removeCompany(user, q, langFrom(req));
  }

  // ---------------- Programmes individuels ----------------
  @Get('users')
  listUsers(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: ScheduleUsersQueryDto) {
    return this.service.listUsers(user, q, langFrom(req));
  }

  @Post('users/bulk')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.CONFIG_CHANGE, 'work_schedules', { category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING })
  bulkUsers(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: BulkUserScheduleDto) {
    return this.service.bulkUsers(user, dto, langFrom(req));
  }

  @Get('users/:userId')
  getUser(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() q: CompanyQueryDto,
  ) {
    return this.service.getUser(user, userId, q, langFrom(req));
  }

  @Put('users/:userId')
  @AuditAction(ActionType.CONFIG_CHANGE, 'work_schedules', { category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING })
  upsertUser(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpsertWorkScheduleDto,
  ) {
    return this.service.upsertUser(user, userId, dto, langFrom(req));
  }

  @Delete('users/:userId')
  @AuditAction(ActionType.DELETE, 'work_schedules', { category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING })
  removeUser(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() q: CompanyQueryDto,
  ) {
    return this.service.removeUser(user, userId, q, langFrom(req));
  }

  // ---------------- Dérogations ----------------
  @Get('exceptions')
  listExceptions(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: ExceptionsQueryDto) {
    return this.service.listExceptions(user, q, langFrom(req));
  }

  @Post('exceptions')
  @AuditAction(ActionType.CREATE, 'work_schedule_exceptions', { category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING })
  createException(@Req() req: Request, @CurrentUser() user: UserEntity, @Body() dto: CreateExceptionDto) {
    return this.service.createException(user, dto, langFrom(req));
  }

  @Post('exceptions/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'work_schedule_exceptions', { category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING })
  revokeException(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeExceptionDto,
  ) {
    return this.service.revokeException(user, id, dto, langFrom(req));
  }

  // ---------------- Simulation ----------------
  @Get('check')
  check(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: CheckAccessQueryDto) {
    return this.service.check(user, q, langFrom(req));
  }
}
