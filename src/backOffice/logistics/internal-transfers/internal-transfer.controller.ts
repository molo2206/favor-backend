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
import { langFrom } from '../common/logistics-access';
import { InternalTransferService } from './internal-transfer.service';
import {
  CancelTransferDto,
  CreateTransferDto,
  DispatchTransferDto,
  ReceiveTransferDto,
  TransferQueryDto,
  UpdateTransferDto,
} from './dto/internal-transfer.dto';

/**
 * BackOffice — Logistique interne : transferts de colis entre branches.
 * Préfixe : /backoffice/logistics/transfers
 */
@Controller('backoffice/logistics/transfers')
@UseGuards(AuthentificationGuard)
export class InternalTransferController {
  constructor(private readonly service: InternalTransferService) { }

  @Post()
  @AuditAction(ActionType.CREATE, 'logistics_transfer')
  create(@Req() req: Request, @Body() dto: CreateTransferDto, @CurrentUser() user: UserEntity) {
    return this.service.create(dto, user, langFrom(req));
  }

  @Get()
  list(@Req() req: Request, @Query() query: TransferQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.list(query, user, langFrom(req));
  }

  /** Colis attendus dans une branche */
  @Get('incoming/:branchId')
  incoming(@Req() req: Request, @Param('branchId', ParseUUIDPipe) branchId: string, @CurrentUser() user: UserEntity) {
    return this.service.incoming(branchId, user, langFrom(req));
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.findOne(id, user, langFrom(req));
  }

  @Patch(':id')
  @AuditAction(ActionType.UPDATE, 'logistics_transfer')
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransferDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.update(id, dto, user, langFrom(req));
  }

  @Post(':id/dispatch')
  @AuditAction(ActionType.UPDATE, 'logistics_transfer')
  dispatch(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispatchTransferDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.dispatch(id, dto, user, langFrom(req));
  }

  @Post(':id/receive')
  @AuditAction(ActionType.UPDATE, 'logistics_transfer')
  receive(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveTransferDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.receive(id, dto, user, langFrom(req));
  }

  @Post(':id/cancel')
  @AuditAction(ActionType.UPDATE, 'logistics_transfer')
  cancel(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTransferDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.cancel(id, dto, user, langFrom(req));
  }
}
