import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { I18nService } from 'src/libs/common/src';
import { PosCustomerService } from './pos-customer.service';
import { CustomerSearchDto, UpsertCustomerDto } from './dto/pos-customer.dto';

/**
 * Clients du point de vente, propres à chaque entreprise (user.activeCompanyId).
 * Pas besoin d'un compte système : un nom (et/ou un téléphone) suffit.
 */
@Controller('pos/customers')
@UseGuards(AuthentificationGuard)
export class PosCustomerController {
  constructor(
    private readonly customers: PosCustomerService,
    private readonly i18n: I18nService,
  ) {}

  private companyId(user: UserEntity, lang: string): string {
    const id = (user as any).activeCompanyId;
    if (!id) throw new BadRequestException(this.i18n.translate('no_active_company', lang));
    return id;
  }

  /** Recherche par nom ou téléphone : GET /pos/customers?search=... */
  @Get()
  search(@Query() query: CustomerSearchDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.customers.search(this.companyId(user, lang), query, lang);
  }

  /** Détail + encours (crédit en cours) */
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.customers.getOne(this.companyId(user, lang), id, lang);
  }

  /** Historique des ventes d'un client */
  @Get(':id/sales')
  sales(@Param('id') id: string, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.customers.sales(this.companyId(user, lang), id, lang);
  }

  /** Créer un client */
  @Post()
  create(@Body() dto: UpsertCustomerDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.customers.upsert(this.companyId(user, lang), dto, lang);
  }

  /** Modifier un client */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertCustomerDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.customers.upsert(this.companyId(user, lang), { ...dto, id }, lang);
  }
}
