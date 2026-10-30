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
import { SupplyService } from './supply.service';
import {
  CancelSupplyDto,
  ChangeSupplyStatusDto,
  ConvertToShipmentDto,
  CreateSupplyDto,
  CreateSupplyFromOrderDto,
  SupplyNoteDto,
  SupplyQueryDto,
  UpdateSupplyDto,
} from './dto/supply.dto';

const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

/**
 * Supply : commande → shipment → expédition → réception, avec historique complet.
 * Préfixe : /supply
 */
@Controller('supply')
@UseGuards(AuthentificationGuard)
export class SupplyController {
  constructor(private readonly service: SupplyService) { }

  private lang(req: Request): string {
    const raw = String(req.headers['accept-language'] || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2);
    return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
  }

  /** Créer les Supply d'une commande (un par vendeur) */
  @Post('from-order/:orderId')
  @AuditAction(ActionType.CREATE, 'supply')
  createFromOrder(
    @Req() req: Request,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateSupplyFromOrderDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.createFromOrder(orderId, dto, user, this.lang(req));
  }

  /** Créer un Supply pour une sous-commande précise */
  @Post()
  @AuditAction(ActionType.CREATE, 'supply')
  create(@Req() req: Request, @Body() dto: CreateSupplyDto, @CurrentUser() user: UserEntity) {
    return this.service.create(dto, user, this.lang(req));
  }

  @Get()
  list(@Req() req: Request, @Query() query: SupplyQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.list(query, user, this.lang(req));
  }

  @Get('stats')
  stats(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.service.stats(user, this.lang(req), companyId);
  }

  /** Chronologie complète d'une commande */
  @Get('order/:orderId/timeline')
  orderTimeline(@Req() req: Request, @Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUser() user: UserEntity) {
    return this.service.orderTimeline(orderId, user, this.lang(req));
  }

  /** Supply d'un shipment (id ou numéro de suivi) */
  @Get('shipment/:key')
  byShipment(@Req() req: Request, @Param('key') key: string, @CurrentUser() user: UserEntity) {
    return this.service.byShipment(key, user, this.lang(req));
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.findOne(id, user, this.lang(req));
  }

  @Get(':id/history')
  history(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.getHistory(id, user, this.lang(req));
  }

  /** Transformer la commande en shipment */
  @Post(':id/convert-to-shipment')
  @AuditAction(ActionType.CREATE, 'supply')
  convert(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertToShipmentDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.convertToShipment(id, dto, user, this.lang(req));
  }

  @Patch(':id')
  @AuditAction(ActionType.UPDATE, 'supply')
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplyDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.update(id, dto, user, this.lang(req));
  }

  @Patch(':id/status')
  @AuditAction(ActionType.UPDATE, 'supply')
  changeStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeSupplyStatusDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.changeStatus(id, dto, user, this.lang(req));
  }

  @Post(':id/notes')
  @AuditAction(ActionType.UPDATE, 'supply')
  addNote(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplyNoteDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.addNote(id, dto.note, user, this.lang(req));
  }

  @Post(':id/cancel')
  @AuditAction(ActionType.UPDATE, 'supply')
  cancel(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSupplyDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.cancel(id, dto, user, this.lang(req));
  }
}
