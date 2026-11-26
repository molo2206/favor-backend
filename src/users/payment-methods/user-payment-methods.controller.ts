import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { UserPaymentMethodsService } from './user-payment-methods.service';
import { CreateUserPaymentMethodDto, UpdateUserPaymentMethodDto } from './dto/user-payment-method.dto';

const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

/**
 * ✅ Moyens de paiement de l'utilisateur connecté : Mobile Money, FPay, Cash.
 * Préfixe : /users/me/payment-methods
 */
@Controller('users/me/payment-methods')
@UseGuards(AuthentificationGuard)
export class UserPaymentMethodsController {
  constructor(private readonly service: UserPaymentMethodsService) { }

  private lang(req: Request): string {
    const raw = String(req?.headers?.['accept-language'] || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2);
    return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
  }

  /** Mes moyens de paiement (le défaut en premier) */
  @Get()
  list(@Req() req: Request, @CurrentUser() user: UserEntity) {
    return this.service.list(user.id, this.lang(req));
  }

  /** Ajouter : { type: MOBILE_MONEY, provider, phone } | { type: FPAY, fpayAccount? } | { type: CASH } */
  @Post()
  @AuditAction(ActionType.CREATE, 'user_payment_methods')
  create(@Req() req: Request, @Body() dto: CreateUserPaymentMethodDto, @CurrentUser() user: UserEntity) {
    return this.service.create(user.id, dto, this.lang(req));
  }

  @Patch(':id')
  @AuditAction(ActionType.UPDATE, 'user_payment_methods')
  update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserPaymentMethodDto, @CurrentUser() user: UserEntity) {
    return this.service.update(user.id, id, dto, this.lang(req));
  }

  /** Choisir le moyen par défaut */
  @Patch(':id/default')
  @AuditAction(ActionType.UPDATE, 'user_payment_methods')
  setDefault(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.setDefault(user.id, id, this.lang(req));
  }

  @Delete(':id')
  @AuditAction(ActionType.DELETE, 'user_payment_methods')
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.remove(user.id, id, this.lang(req));
  }
}
