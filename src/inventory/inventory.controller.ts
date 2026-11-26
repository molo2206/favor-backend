import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { I18nService } from 'src/libs/common/src';
import { InventoryService } from './inventory.service';
import { CompanyCapabilitiesService } from './capabilities/company-capabilities.service';
import {
  AdjustStockDto,
  ConsumeStockDto,
  CreateLocationDto,
  ExpiringQueryDto,
  ReceiveStockDto,
  StockQueryDto,
  TransferStockDto,
} from './dto/inventory.dto';

/**
 * Inventaire avancé (entreprises avec hasInventory : SHOP, GROCERY, RESTAURANT, PHARMACIE…).
 * La société est celle active de l'utilisateur (user.activeCompanyId).
 */
@Controller('inventory')
@UseGuards(AuthentificationGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly capabilities: CompanyCapabilitiesService,
    private readonly i18n: I18nService,
  ) {}

  private companyId(user: UserEntity, lang: string): string {
    const id = (user as any).activeCompanyId;
    if (!id) throw new BadRequestException(this.i18n.translate('no_active_company', lang));
    return id;
  }

  /** Capacités effectives de l'entreprise (ce que le front doit activer/masquer) */
  @Get('capabilities')
  caps(@CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.capabilities.forCompany(this.companyId(user, lang));
  }

  // Emplacements
  @Post('locations')
  createLocation(@Body() dto: CreateLocationDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.inventory.createLocation(this.companyId(user, lang), dto, lang);
  }

  @Get('locations')
  listLocations(@CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.inventory.listLocations(this.companyId(user, lang), lang);
  }

  // Mouvements
  @Post('receive')
  receive(@Body() dto: ReceiveStockDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.inventory.receive(this.companyId(user, lang), dto, lang, user.id);
  }

  @Post('consume')
  consume(@Body() dto: ConsumeStockDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.inventory.consume(this.companyId(user, lang), dto, lang, { performedById: user.id, hasPrescription: dto.hasPrescription });
  }

  @Post('adjust')
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.inventory.adjust(this.companyId(user, lang), dto, lang, user.id);
  }

  @Post('transfer')
  transfer(@Body() dto: TransferStockDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.inventory.transfer(this.companyId(user, lang), dto, lang, user.id);
  }

  // Consultations
  @Get('stock')
  stock(@Query() query: StockQueryDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.inventory.listStock(this.companyId(user, lang), query, lang);
  }

  @Get('low-stock')
  low(@CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.inventory.lowStock(this.companyId(user, lang), lang);
  }

  @Get('expiring')
  expiring(@Query() query: ExpiringQueryDto, @CurrentUser() user: UserEntity, @Headers('lang') lang = 'fr') {
    return this.inventory.expiringSoon(this.companyId(user, lang), query, lang);
  }
}
