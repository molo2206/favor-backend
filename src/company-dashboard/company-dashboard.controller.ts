import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyDashboardService } from './company-dashboard.service';

const LANGS = ['fr', 'en', 'sw', 'es', 'ar'];

/**
 * ✅ Tableau de bord de l'ENTREPRISE ACTIVE (user.activeCompanyId), adapté à son type
 *    (RESTAURANT, SHOP, GROCERY, HOTEL, TRANSPORT_AGENCY, SHIPPING, TAXI…).
 *
 *  GET /company-dashboard?startDate=2026-10-01&endDate=2026-10-30
 *      startDate / endDate : facultatifs (défaut : 30 derniers jours), comparaison avec la période précédente
 *      companyId           : super admin seulement (consulter une autre entreprise)
 */
@ApiTags('Dashboard entreprise')
@ApiBearerAuth()
@Controller('company-dashboard')
export class CompanyDashboardController {
  constructor(private readonly dashboard: CompanyDashboardService) { }

  private lang(req: Request, user?: UserEntity): string {
    const header = String(req.headers['lang'] || req.headers['accept-language'] || '')
      .split(',')[0]
      .split(';')[0]
      .trim()
      .slice(0, 2)
      .toLowerCase();
    if (LANGS.includes(header)) return header;
    const fromUser = (user as any)?.settings?.language;
    return LANGS.includes(fromUser) ? fromUser : 'fr';
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  @ApiQuery({ name: 'startDate', required: false, example: '2026-10-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-10-30' })
  @ApiQuery({ name: 'companyId', required: false, description: 'Super admin uniquement' })
  async get(
    @CurrentUser() user: UserEntity,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('companyId') companyId: string,
    @Req() req: Request,
  ) {
    return this.dashboard.dashboard(user, { startDate, endDate, companyId }, this.lang(req, user));
  }
}
