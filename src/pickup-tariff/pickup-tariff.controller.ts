import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CompanyPermissionsGuard } from 'src/users/utility/guards/company-permissions.guard';
import { Permissions } from 'src/users/utility/guards/permissions.guard';
import { PickupTariffService } from './pickup-tariff.service';
import {
  CreatePickupTariffDto,
  UpdatePickupTariffDto,
  UpsertPickupTierDto,
  ListPickupTariffDto,
  QuotePickupDto,
} from './dto/pickup-tariff.dto';

@Controller('pickup-tariffs')
export class PickupTariffController {
  constructor(private readonly service: PickupTariffService) {}

  private lang(req: Request): string {
    const raw = (req.headers['accept-language'] as string) || '';
    const primary = raw.split(',')[0].split(';')[0].trim();
    return ['fr', 'en', 'sw', 'es'].includes(primary) ? primary : 'fr';
  }

  // ---- Calcul du tarif de ramassage (à appeler à la création d'un colis) ----
  @Get('quote')
  @UseGuards(AuthentificationGuard)
  quote(@Req() req: Request, @Query() query: QuotePickupDto) {
    return this.service.quote(query, this.lang(req));
  }

  // ---- CRUD des tarifs (admin) ----
  @Post()
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @Permissions({ resource: 'LOGISTICS', action: 'canManage' })
  create(@Req() req: Request, @Body() dto: CreatePickupTariffDto) {
    return this.service.create(dto, this.lang(req));
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  list(@Req() req: Request, @Query() query: ListPickupTariffDto) {
    return this.service.list(query, this.lang(req));
  }

  @Get(':id')
  @UseGuards(AuthentificationGuard)
  async findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.findOne(id, this.lang(req));
    return { message: 'OK', data };
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @Permissions({ resource: 'LOGISTICS', action: 'canManage' })
  update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePickupTariffDto) {
    return this.service.update(id, dto, this.lang(req));
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @Permissions({ resource: 'LOGISTICS', action: 'canManage' })
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id, this.lang(req));
  }

  // ---- Paliers (unitaires) ----
  @Post(':id/tiers')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @Permissions({ resource: 'LOGISTICS', action: 'canManage' })
  addTier(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertPickupTierDto) {
    return this.service.addTier(id, dto, this.lang(req));
  }

  @Patch('tiers/:tierId')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @Permissions({ resource: 'LOGISTICS', action: 'canManage' })
  updateTier(@Req() req: Request, @Param('tierId', ParseUUIDPipe) tierId: string, @Body() dto: UpsertPickupTierDto) {
    return this.service.updateTier(tierId, dto, this.lang(req));
  }

  @Delete('tiers/:tierId')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @Permissions({ resource: 'LOGISTICS', action: 'canManage' })
  removeTier(@Req() req: Request, @Param('tierId', ParseUUIDPipe) tierId: string) {
    return this.service.removeTier(tierId, this.lang(req));
  }
}
