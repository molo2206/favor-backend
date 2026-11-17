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
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { ParcelTransferService } from './parcel-transfer.service';
import {
  CancelCheckinDto,
  CancelTransferDto,
  CheckinQueryDto,
  CloseCheckinDto,
  CreateTransferDto,
  OpenTransferCheckinDto,
  ReturnMissingDto,
  ScanParcelDto,
  TransferQueryDto,
  UpdateCheckinItemDto,
} from './dto/parcel-transfer.dto';

const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

/**
 * Transferts de colis entre branches + pointage à l'arrivée.
 * Préfixe : /branch-stock/transfers et /branch-stock/checkins
 * ⚠️ Déclaré AVANT BranchStockController dans le module (sinon « GET /branch-stock/:stockId » capterait ces routes).
 */
@Controller('branch-stock')
@UseGuards(AuthentificationGuard)
export class ParcelTransferController {
  constructor(private readonly service: ParcelTransferService) { }

  private lang(req: Request): string {
    const raw = String(req.headers['accept-language'] || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2);
    return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
  }

  // ============================================================
  // TRANSFERTS (branche de départ)
  // ============================================================

  /** Envoyer des colis vers une autre branche (ils sortent du stock de départ) */
  @Post('transfers')
  @AuditAction(ActionType.CREATE, 'parcel_transfers')
  createTransfer(@Req() req: Request, @Body() dto: CreateTransferDto, @CurrentUser() user: UserEntity) {
    return this.service.createTransfer(dto, user, this.lang(req));
  }

  /** Transferts d'une branche : ?branchId=&direction=IN|OUT|ALL&status=&search=&page=&limit= */
  @Get('transfers')
  listTransfers(@Req() req: Request, @Query() query: TransferQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listTransfers(query, user, this.lang(req));
  }

  /** Transferts que la branche doit encore recevoir (avec le pointage ouvert éventuel) */
  @Get('transfers/incoming/:branchId')
  incoming(@Req() req: Request, @Param('branchId', ParseUUIDPipe) branchId: string, @CurrentUser() user: UserEntity) {
    return this.service.incoming(branchId, user, this.lang(req));
  }

  @Get('transfers/:id')
  getTransfer(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.getTransfer(id, user, this.lang(req));
  }

  /** Annuler avant réception : les colis reviennent dans le stock de départ */
  @Post('transfers/:id/cancel')
  @AuditAction(ActionType.UPDATE, 'parcel_transfers')
  cancelTransfer(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTransferDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.cancelTransfer(id, dto, user, this.lang(req));
  }

  /** Réception partielle : remettre les pièces manquantes dans le stock de départ */
  @Post('transfers/:id/return-missing')
  @AuditAction(ActionType.UPDATE, 'parcel_transfers')
  returnMissing(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnMissingDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.returnMissing(id, dto, user, this.lang(req));
  }

  // ============================================================
  // POINTAGE À L'ARRIVÉE (branche de destination)
  // ============================================================

  /** Ouvrir (ou reprendre) le pointage de réception d'un transfert */
  @Post('checkins/transfer')
  @AuditAction(ActionType.CREATE, 'parcel_checkins')
  openTransferCheckin(@Req() req: Request, @Body() dto: OpenTransferCheckinDto, @CurrentUser() user: UserEntity) {
    return this.service.openTransferCheckin(dto, user, this.lang(req));
  }

  /** Séances de pointage : ?branchId=&transferId=&status=&page=&limit= */
  @Get('checkins')
  listCheckins(@Req() req: Request, @Query() query: CheckinQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.listCheckins(query, user, this.lang(req));
  }

  @Get('checkins/:id')
  getCheckin(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.getCheckin(id, user, this.lang(req));
  }

  /** Scanner un colis (numéro de suivi) */
  @Post('checkins/:id/scan')
  @AuditAction(ActionType.UPDATE, 'parcel_checkins')
  scan(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScanParcelDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.scan(id, dto, user, this.lang(req));
  }

  /** Corriger une ligne (quantité pointée, abîmé, note) */
  @Patch('checkins/:id/items/:itemId')
  @AuditAction(ActionType.UPDATE, 'parcel_checkins')
  updateItem(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCheckinItemDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.updateItem(id, itemId, dto, user, this.lang(req));
  }

  /** Retirer un colis non prévu / un code inconnu scanné par erreur */
  @Delete('checkins/:id/items/:itemId')
  @AuditAction(ActionType.UPDATE, 'parcel_checkins')
  removeItem(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.removeItem(id, itemId, user, this.lang(req));
  }

  /** Clôturer : les colis pointés entrent dans le stock de la branche */
  @Post('checkins/:id/close')
  @AuditAction(ActionType.UPDATE, 'parcel_checkins')
  closeCheckin(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCheckinDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.closeCheckin(id, dto, user, this.lang(req));
  }

  /** Annuler le pointage (aucun effet sur le stock) */
  @Post('checkins/:id/cancel')
  @AuditAction(ActionType.UPDATE, 'parcel_checkins')
  cancelCheckin(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelCheckinDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.cancelCheckin(id, dto, user, this.lang(req));
  }
}
