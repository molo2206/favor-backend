import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { DriverCashoutService } from './driver-cashout.service';
import { DriverCashoutDto, DriverCashoutQueryDto, DriverEarningsSummaryQueryDto, ResolveDriverCashoutDto } from './dto/driver-cashout.dto';

const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

/**
 * ✅ Retrait des gains du chauffeur via F-Pay (taxi/driver/cashout)
 *   GET   /rides/driver/earnings                       solde retirable par devise
 *   GET   /rides/driver/earnings/wallets               portefeuilles par devise (USD, CDF…), créés automatiquement par les courses
 *   GET   /rides/driver/earnings/fpay-wallets          wallets F-Pay du chauffeur (compte lié), par devise
 *   GET   /rides/driver/earnings/summary               gains séparés par devise : aujourd'hui, semaine, mois, total, 7 jours ?tzOffset=-120
 *   POST  /rides/driver/earnings/cashout               { amount, currency } → F-Pay reçoit { amount, description, currency, countryCode, paymentMethod, userId, toApiKey }
 *                                                      en-tête conseillé : Idempotency-Key
 *   GET   /rides/driver/earnings/cashouts              historique du chauffeur
 *   GET   /rides/driver/earnings/cashouts/:id          un retrait
 *   GET   /rides/driver/earnings/admin/cashouts        (admin) tous les retraits ?status=UNKNOWN
 *   PATCH /rides/driver/earnings/admin/cashouts/:id/resolve  (admin) { status: SUCCESS|FAILED, fpayReference?, note? }
 */
@Controller('rides/driver/earnings')
@UseGuards(AuthentificationGuard)
export class DriverCashoutController {
  constructor(private readonly cashouts: DriverCashoutService) { }

  private lang(req: Request): string {
    const raw = String((req as any)?.query?.language || req?.headers?.['accept-language'] || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2);
    return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
  }

  @Get()
  balance(@Req() req: Request, @CurrentUser() user: UserEntity) {
    return this.cashouts.balance(user, this.lang(req));
  }

  /** ✅ Portefeuilles du chauffeur, un par devise (USD, CDF…) */
  @Get('wallets')
  wallets(@Req() req: Request, @CurrentUser() user: UserEntity) {
    return this.cashouts.wallets(user, this.lang(req));
  }

  /** ✅ Wallets F-Pay du chauffeur (compte F-Pay lié) : celui de la devise reçoit le retrait */
  @Get('fpay-wallets')
  fpayWallets(@Req() req: Request, @CurrentUser() user: UserEntity) {
    return this.cashouts.fpayWallets(user, this.lang(req));
  }

  /** ✅ Gains du chauffeur séparés par devise (jamais additionnés entre USD, CDF…) */
  @Get('summary')
  summary(@Req() req: Request, @Query() query: DriverEarningsSummaryQueryDto, @CurrentUser() user: UserEntity) {
    return this.cashouts.summary(user, query, this.lang(req));
  }

  @Post('cashout')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.CREATE, 'driver_cashouts')
  cashout(
    @Req() req: Request,
    @Body() dto: DriverCashoutDto,
    @CurrentUser() user: UserEntity,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.cashouts.cashout(user, dto, this.lang(req), idempotencyKey);
  }

  @Get('cashouts')
  list(@Req() req: Request, @Query() query: DriverCashoutQueryDto, @CurrentUser() user: UserEntity) {
    return this.cashouts.list(user, query, this.lang(req));
  }

  @Get('cashouts/:id')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.cashouts.findOne(id, user, this.lang(req));
  }

  @Get('admin/cashouts')
  adminList(@Req() req: Request, @Query() query: DriverCashoutQueryDto, @CurrentUser() user: UserEntity) {
    return this.cashouts.list(user, query, this.lang(req), true);
  }

  @Patch('admin/cashouts/:id/resolve')
  @AuditAction(ActionType.UPDATE, 'driver_cashouts')
  resolve(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveDriverCashoutDto, @CurrentUser() user: UserEntity) {
    return this.cashouts.resolve(id, dto, user, this.lang(req));
  }
}
