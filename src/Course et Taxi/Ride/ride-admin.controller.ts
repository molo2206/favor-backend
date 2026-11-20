import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { Roles } from 'src/users/utility/decorators/roles.decorator';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { RideAdminDashboardService } from './ride-admin-dashboard.service';
import { RideCashCommissionService } from './ride-cash-commission.service';
import {
  RideAdminDriversQueryDto,
  RideAdminFilterDto,
  RideAdminListQueryDto,
  RideCashCommissionQueryDto,
} from './dto/ride-admin-dashboard.dto';

const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

/**
 * ✅ Administration des courses taxi : tableau de bord, liste filtrée, chauffeurs, commissions espèces.
 * Réservé ADMIN / SUPER ADMIN. Lecture seule, sauf la relance d'un crédit F-Pay TAXI en échec.
 *
 *  GET  /admin/rides/dashboard                       vue d'ensemble (filtres : voir RideAdminFilterDto)
 *  GET  /admin/rides                                 liste paginée (mêmes filtres + page, limit, sortBy, sortDir)
 *  GET  /admin/rides/drivers?search=                 chauffeurs pour le filtre
 *  GET  /admin/rides/cash-commissions                commissions des courses en espèces
 *  POST /admin/rides/cash-commissions/:id/retry      relancer le crédit du compte TAXI
 */
@Controller('admin/rides')
@UseGuards(AuthentificationGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class RideAdminController {
  constructor(
    private readonly dashboardService: RideAdminDashboardService,
    private readonly cashCommission: RideCashCommissionService,
  ) { }

  private lang(req: Request): string {
    const raw = String(req?.headers?.['accept-language'] || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2);
    return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
  }

  @Get('dashboard')
  dashboard(@Req() req: Request, @Query() query: RideAdminFilterDto) {
    return this.dashboardService.dashboard(query, this.lang(req));
  }

  @Get('drivers')
  drivers(@Req() req: Request, @Query() query: RideAdminDriversQueryDto) {
    return this.dashboardService.drivers(query, this.lang(req));
  }

  @Get('cash-commissions')
  cashCommissions(@Req() req: Request, @Query() query: RideCashCommissionQueryDto) {
    return this.dashboardService.cashCommissions(query, this.lang(req));
  }

  @Post('cash-commissions/:id/retry')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'driver_wallet_movements')
  retryCashCommission(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ) {
    return this.cashCommission.retryCredit(id, user.id, this.lang(req));
  }

  @Get()
  list(@Req() req: Request, @Query() query: RideAdminListQueryDto) {
    return this.dashboardService.list(query, this.lang(req));
  }
}
