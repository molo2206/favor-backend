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
import { langFrom } from '../common/logistics-access';
import { AssetService } from './asset.service';
import {
  AssetMovementQueryDto,
  AssetNoteDto,
  AssetQueryDto,
  AssignAssetDto,
  CheckAssetDto,
  ConditionAssetDto,
  CreateAssetCategoryDto,
  CreateAssetDto,
  DisposeAssetDto,
  RepairAssetDto,
  ReturnAssetDto,
  TransferAssetDto,
  UpdateAssetCategoryDto,
  UpdateAssetDto,
} from './dto/asset.dto';

/**
 * BackOffice — Logistique interne : biens de l'entreprise (patrimoine).
 * Préfixe : /backoffice/logistics
 */
@Controller('backoffice/logistics')
@UseGuards(AuthentificationGuard)
export class AssetController {
  constructor(private readonly service: AssetService) { }

  // ---------- Tableau de bord + journal ----------
  @Get('dashboard')
  dashboard(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.service.dashboard(user, langFrom(req), companyId);
  }

  @Get('movements')
  movements(@Req() req: Request, @Query() query: AssetMovementQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.movements(query, user, langFrom(req));
  }

  // ---------- Catégories ----------
  @Post('categories')
  @AuditAction(ActionType.CREATE, 'asset_category')
  createCategory(@Req() req: Request, @Body() dto: CreateAssetCategoryDto, @CurrentUser() user: UserEntity) {
    return this.service.createCategory(dto, user, langFrom(req));
  }

  @Get('categories')
  listCategories(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.service.listCategories(user, langFrom(req), companyId);
  }

  @Patch('categories/:id')
  @AuditAction(ActionType.UPDATE, 'asset_category')
  updateCategory(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetCategoryDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.updateCategory(id, dto, user, langFrom(req));
  }

  @Delete('categories/:id')
  @AuditAction(ActionType.DELETE, 'asset_category')
  deleteCategory(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.deleteCategory(id, user, langFrom(req));
  }

  // ---------- Biens ----------
  @Post('assets')
  @AuditAction(ActionType.CREATE, 'asset')
  create(@Req() req: Request, @Body() dto: CreateAssetDto, @CurrentUser() user: UserEntity) {
    return this.service.create(dto, user, langFrom(req));
  }

  @Get('assets')
  list(@Req() req: Request, @Query() query: AssetQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.list(query, user, langFrom(req));
  }

  /** Scan : code d'inventaire, code-barres ou n° de série */
  @Get('assets/code/:code')
  findByCode(
    @Req() req: Request,
    @Param('code') code: string,
    @CurrentUser() user: UserEntity,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.findByCode(code, user, langFrom(req), companyId);
  }

  /** Équipements affectés à un employé */
  @Get('assets/user/:userId')
  byUser(
    @Req() req: Request,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: UserEntity,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.byUser(userId, user, langFrom(req), companyId);
  }

  @Get('assets/:id')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.findOne(id, user, langFrom(req));
  }

  @Patch('assets/:id')
  @AuditAction(ActionType.UPDATE, 'asset')
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.update(id, dto, user, langFrom(req));
  }

  @Post('assets/:id/assign')
  @AuditAction(ActionType.UPDATE, 'asset')
  assign(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignAssetDto, @CurrentUser() user: UserEntity) {
    return this.service.assign(id, dto, user, langFrom(req));
  }

  @Post('assets/:id/return')
  @AuditAction(ActionType.UPDATE, 'asset')
  returnAsset(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnAssetDto, @CurrentUser() user: UserEntity) {
    return this.service.returnAsset(id, dto, user, langFrom(req));
  }

  @Post('assets/:id/transfer')
  @AuditAction(ActionType.UPDATE, 'asset')
  transfer(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferAssetDto, @CurrentUser() user: UserEntity) {
    return this.service.transfer(id, dto, user, langFrom(req));
  }

  @Post('assets/:id/repair')
  @AuditAction(ActionType.UPDATE, 'asset')
  repair(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RepairAssetDto, @CurrentUser() user: UserEntity) {
    return this.service.repair(id, dto, user, langFrom(req));
  }

  @Post('assets/:id/condition')
  @AuditAction(ActionType.UPDATE, 'asset')
  condition(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConditionAssetDto, @CurrentUser() user: UserEntity) {
    return this.service.changeCondition(id, dto, user, langFrom(req));
  }

  @Post('assets/:id/check')
  @AuditAction(ActionType.UPDATE, 'asset')
  check(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckAssetDto, @CurrentUser() user: UserEntity) {
    return this.service.check(id, dto, user, langFrom(req));
  }

  @Post('assets/:id/lost')
  @AuditAction(ActionType.UPDATE, 'asset')
  lost(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssetNoteDto, @CurrentUser() user: UserEntity) {
    return this.service.markLost(id, dto ?? {}, user, langFrom(req));
  }

  @Post('assets/:id/found')
  @AuditAction(ActionType.UPDATE, 'asset')
  found(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssetNoteDto, @CurrentUser() user: UserEntity) {
    return this.service.markFound(id, dto ?? {}, user, langFrom(req));
  }

  @Post('assets/:id/dispose')
  @AuditAction(ActionType.UPDATE, 'asset')
  dispose(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DisposeAssetDto, @CurrentUser() user: UserEntity) {
    return this.service.dispose(id, dto, user, langFrom(req));
  }
}
