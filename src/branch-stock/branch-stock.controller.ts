import {
  Body,
  Controller,
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
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { BranchStockService } from './branch-stock.service';
import {
  AdjustStockDto,
  DecreaseStockDto,
  MovementQueryDto,
  ReceiveLtaDto,
  ReceiveParcelDto,
  SetLocationDto,
  StockQueryDto,
  WithdrawParcelDto,
} from './dto/branch-stock.dto';

const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

/**
 * Réception des colis et stock des branches (approvisionnement).
 * Préfixe : /branch-stock
 */
@Controller('branch-stock')
@UseGuards(AuthentificationGuard)
export class BranchStockController {
  constructor(private readonly service: BranchStockService) { }

  private lang(req: Request): string {
    const raw = String(req.headers['accept-language'] || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2);
    return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
  }

  // ---------- Entrées ----------

  /** Réceptionner un colis dans une branche */
  @Post('receive')
  @AuditAction(ActionType.CREATE, 'branch_stock')
  receive(@Req() req: Request, @Body() dto: ReceiveParcelDto, @CurrentUser() user: UserEntity) {
    return this.service.receive(dto, user, this.lang(req));
  }

  /** Réceptionner tous les colis d'une LTA */
  @Post('receive-lta')
  @AuditAction(ActionType.CREATE, 'branch_stock')
  receiveLta(@Req() req: Request, @Body() dto: ReceiveLtaDto, @CurrentUser() user: UserEntity) {
    return this.service.receiveLta(dto, user, this.lang(req));
  }

  // ---------- Sorties ----------

  /** Retrait du colis par le client (diminue le stock de la branche) */
  @Post('withdraw')
  @AuditAction(ActionType.UPDATE, 'branch_stock')
  withdraw(@Req() req: Request, @Body() dto: WithdrawParcelDto, @CurrentUser() user: UserEntity) {
    return this.service.withdraw(dto, user, this.lang(req));
  }

  /** Diminution manuelle (perte, casse, retour…) — motif obligatoire */
  @Post(':stockId/decrease')
  @AuditAction(ActionType.UPDATE, 'branch_stock')
  decrease(
    @Req() req: Request,
    @Param('stockId', ParseUUIDPipe) stockId: string,
    @Body() dto: DecreaseStockDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.decrease(stockId, dto, user, this.lang(req));
  }

  /** Inventaire : corriger avec la quantité réellement comptée */
  @Post(':stockId/adjust')
  @AuditAction(ActionType.UPDATE, 'branch_stock')
  adjust(
    @Req() req: Request,
    @Param('stockId', ParseUUIDPipe) stockId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.adjust(stockId, dto, user, this.lang(req));
  }

  /** Emplacement dans le dépôt */
  @Patch(':stockId/location')
  @AuditAction(ActionType.UPDATE, 'branch_stock')
  setLocation(
    @Req() req: Request,
    @Param('stockId', ParseUUIDPipe) stockId: string,
    @Body() dto: SetLocationDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.setLocation(stockId, dto.location, user, this.lang(req));
  }

  // ---------- Consultation ----------

  /** Journal de pointage (filtres : branche, shipment, type, IN/OUT, dates) */
  @Get('movements')
  movements(@Req() req: Request, @Query() query: MovementQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.movements(query, user, this.lang(req));
  }

  /** Où se trouve un colis (id ou numéro de suivi) */
  @Get('shipment/:shipmentIdOrTracking')
  byShipment(@Req() req: Request, @Param('shipmentIdOrTracking') key: string) {
    return this.service.byShipment(key, this.lang(req));
  }

  /** Stock d'une branche */
  @Get('branch/:branchId')
  listByBranch(
    @Req() req: Request,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: StockQueryDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.listByBranch(branchId, query, user, this.lang(req));
  }

  /** Résumé : entrées, sorties, stock restant (période : from / to, par défaut aujourd'hui) */
  @Get('branch/:branchId/summary')
  summary(
    @Req() req: Request,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @CurrentUser() user: UserEntity,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.summary(branchId, user, this.lang(req), from, to);
  }

  @Get(':stockId')
  findOne(@Req() req: Request, @Param('stockId', ParseUUIDPipe) stockId: string, @CurrentUser() user: UserEntity) {
    return this.service.findOne(stockId, user, this.lang(req));
  }
}
