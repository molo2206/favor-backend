import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { I18nService } from 'src/libs/common/src';
import { PosService } from './pos.service';
import { PosSyncService } from './pos-sync.service';
import {
  AddPaymentDto,
  CatalogQueryDto,
  CloseSessionDto,
  CreateSaleDto,
  CreateTerminalDto,
  CreditsQueryDto,
  OpenSessionDto,
  SalesQueryDto,
  UpdateTerminalConfigDto,
  UpsertProductDto,
} from './dto/pos.dto';
import { SyncBatchDto } from './dto/pos-sync.dto';

/**
 * Point de vente (caisse) : terminaux, sessions, ventes directes, et synchro offline.
 * Réservé aux entreprises dont le type a la capacité `hasPOS`.
 */
@Controller('pos')
@UseGuards(AuthentificationGuard)
export class PosController {
  constructor(
    private readonly pos: PosService,
    private readonly sync: PosSyncService,
    private readonly i18n: I18nService,
  ) {}

  private companyId(user: UserEntity, lang: string): string {
    const id = (user as any).activeCompanyId;
    if (!id) throw new BadRequestException(this.i18n.translate('no_active_company', lang));
    return id;
  }

  // Terminaux (config POS dynamique)
  @Post('terminals')
  createTerminal(@Body() dto: CreateTerminalDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.createTerminal(this.companyId(user, lang), dto, lang);
  }

  @Patch('terminals/:id')
  updateTerminal(@Param('id') id: string, @Body() dto: UpdateTerminalConfigDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.updateTerminal(this.companyId(user, lang), id, dto, lang);
  }

  @Get('terminals')
  listTerminals(@CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.listTerminals(this.companyId(user, lang), lang);
  }

  // Sessions de caisse
  @Post('sessions/open')
  openSession(@Body() dto: OpenSessionDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.openSession(this.companyId(user, lang), dto, user.id, lang);
  }

  @Post('sessions/:id/close')
  closeSession(@Param('id') id: string, @Body() dto: CloseSessionDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.closeSession(this.companyId(user, lang), id, dto, user.id, lang);
  }

  @Get('sessions/:id/summary')
  sessionSummary(@Param('id') id: string, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.sessionSummary(this.companyId(user, lang), id, lang);
  }

  // Ventes
  @Post('sales')
  createSale(@Body() dto: CreateSaleDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.createSale(this.companyId(user, lang), dto, user.id, lang);
  }

  @Get('sales')
  listSales(@Query() query: SalesQueryDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.listSales(this.companyId(user, lang), query, lang);
  }

  // Règlement d'une vente à crédit / reste dû
  @Post('sales/:id/payments')
  addPayment(@Param('id') id: string, @Body() dto: AddPaymentDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.addPayment(this.companyId(user, lang), id, dto, user.id, lang);
  }

  // Crédits clients (ventes avec reste dû)
  @Get('credits')
  credits(@Query() query: CreditsQueryDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.listCredits(this.companyId(user, lang), query, lang);
  }

  // Catalogue produits (pour la caisse hors-ligne, synchro incrémentale via updatedSince)
  @Get('catalog')
  catalog(@Query() query: CatalogQueryDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.catalog(this.companyId(user, lang), query, lang);
  }

  // Créer un produit depuis la caisse (id généré localement possible)
  @Post('products')
  createProduct(@Body() dto: UpsertProductDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.upsertProduct(this.companyId(user, lang), dto, user.id, lang);
  }

  // Modifier un produit
  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpsertProductDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.pos.upsertProduct(this.companyId(user, lang), { ...dto, id }, user.id, lang);
  }

  // Synchro offline
  @Post('sync')
  sync(@Body() dto: SyncBatchDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.sync.applyBatch(this.companyId(user, lang), dto, user.id, lang);
  }

  @Get('sync/:terminalId/cursor')
  cursor(@Param('terminalId') terminalId: string, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.sync.cursor(this.companyId(user, lang), terminalId, lang);
  }
}
