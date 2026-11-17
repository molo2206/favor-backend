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
import { AuthorizeGuard } from 'src/users/utility/guards/authorization.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize.roles.decorator';
import { UserRole } from 'src/users/enum/user-role-enum';
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
  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  @AuthorizeRoles(UserRole.ADMIN)
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
  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePickupTariffDto) {
    return this.service.update(id, dto, this.lang(req));
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id, this.lang(req));
  }

  // ---- Paliers (unitaires) ----
  @Post(':id/tiers')
  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  addTier(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertPickupTierDto) {
    return this.service.addTier(id, dto, this.lang(req));
  }

  @Patch('tiers/:tierId')
  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  updateTier(@Req() req: Request, @Param('tierId', ParseUUIDPipe) tierId: string, @Body() dto: UpsertPickupTierDto) {
    return this.service.updateTier(tierId, dto, this.lang(req));
  }

  @Delete('tiers/:tierId')
  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  removeTier(@Req() req: Request, @Param('tierId', ParseUUIDPipe) tierId: string) {
    return this.service.removeTier(tierId, this.lang(req));
  }
}
