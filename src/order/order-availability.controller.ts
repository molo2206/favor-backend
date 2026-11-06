import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { OrderAvailabilityService } from './order-availability.service';
import { ConfirmAvailabilityDto } from './dto/confirm-availability.dto';

const LANGS = ['fr', 'en', 'sw', 'es', 'ar'];

/**
 * ✅ Disponibilité des produits d'une commande — côté PROPRIÉTAIRE (boutique / restaurant) ou admin.
 *
 *  GET   /orders/availability/pending?page=1&limit=20   commandes qui attendent ma réponse
 *  GET   /orders/availability/:orderId                                    la commande (mes produits seulement)
 *  PATCH /orders/availability/:orderId                                    « Disponible » / « Indisponible »
 */
@ApiTags('Orders - disponibilité')
@ApiBearerAuth()
@Controller('orders/availability')
export class OrderAvailabilityController {
  constructor(private readonly availability: OrderAvailabilityService) { }

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

  @Get('pending')
  @UseGuards(AuthentificationGuard)
  async myOrders(
    @CurrentUser() user: UserEntity,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: Request,
  ) {
    return this.availability.myPending(user, { page: Number(page), limit: Number(limit) }, this.lang(req, user));
  }

  @Get(':orderId')
  @UseGuards(AuthentificationGuard)
  async view(@Param('orderId') orderId: string, @CurrentUser() user: UserEntity, @Req() req: Request) {
    return this.availability.view(orderId, user, this.lang(req, user));
  }

  @Patch(':orderId')
  @UseGuards(AuthentificationGuard)
  async confirm(
    @Param('orderId') orderId: string,
    @Body() dto: ConfirmAvailabilityDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    return this.availability.confirm(orderId, user, dto, this.lang(req, user));
  }
}
