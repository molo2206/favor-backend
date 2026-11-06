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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  AssignmentQueryDto,
  BulkAssignDto,
  BulkReturnDto,
  CheckAssetDto,
  ConditionAssetDto,
  CreateAssetCategoryDto,
  CreateAssetDto,
  DisposeAssetDto,
  LostAssetDto,
  RepairAssetDto,
  ReturnAssetDto,
  StockInDto,
  TransferAssetDto,
  UpdateAssetCategoryDto,
  UpdateAssetDto,
} from './dto/asset.dto';

/**
 * BackOffice — Logistique interne : biens de l'entreprise (patrimoine).
 * ✅ Chaque création / action accepte une image (multipart, champ `image`).
 * ✅ Entrées (lot, réapprovisionnement), sorties partielles (quantités), sorties / restitutions groupées, bon de sortie.
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
  @UseInterceptors(FileInterceptor('image'))
  createCategory(
    @Req() req: Request,
    @Body() dto: CreateAssetCategoryDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.createCategory(dto, file, user, langFrom(req));
  }

  @Get('categories')
  listCategories(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.service.listCategories(user, langFrom(req), companyId);
  }

  @Patch('categories/:id')
  @AuditAction(ActionType.UPDATE, 'asset_category')
  @UseInterceptors(FileInterceptor('image'))
  updateCategory(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetCategoryDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.updateCategory(id, dto, file, user, langFrom(req));
  }

  @Delete('categories/:id')
  @AuditAction(ActionType.DELETE, 'asset_category')
  deleteCategory(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.deleteCategory(id, user, langFrom(req));
  }

  // ---------- Sorties / restitutions (quantités) ----------
  /** Remises en cours ou passées (filtres : employé, bien, active=true) */
  @Get('assignments')
  assignments(@Req() req: Request, @Query() query: AssignmentQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.assignments(query, user, langFrom(req));
  }

  /** Sortie groupée : un employé reçoit plusieurs biens en une fois → bon de sortie */
  @Post('assignments/bulk-assign')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  bulkAssign(@Req() req: Request, @Body() dto: BulkAssignDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.bulkAssign(dto, file, user, langFrom(req));
  }

  /** Restitution groupée */
  @Post('assignments/bulk-return')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  bulkReturn(@Req() req: Request, @Body() dto: BulkReturnDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.bulkReturn(dto, file, user, langFrom(req));
  }

  /** Bon de sortie (données à imprimer) */
  @Get('assignments/:id/delivery-note')
  deliveryNote(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.deliveryNoteFor(id, user, langFrom(req));
  }

  // ---------- Biens ----------
  /** Entrée dans le patrimoine (un bien ou un lot : quantity) — multipart avec `image` */
  @Post('assets')
  @AuditAction(ActionType.CREATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  create(@Req() req: Request, @Body() dto: CreateAssetDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.create(dto, file, user, langFrom(req));
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

  /** Équipements (et quantités) détenus par un employé */
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
  @UseInterceptors(FileInterceptor('image'))
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.update(id, dto, file, user, langFrom(req));
  }

  /** Entrée de stock : nouvelles unités d'un bien existant */
  @Post('assets/:id/stock-in')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  stockIn(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StockInDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.stockIn(id, dto, file, user, langFrom(req));
  }

  /** Sortie vers un employé : quantity unités (défaut : tout le stock) */
  @Post('assets/:id/assign')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  assign(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignAssetDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.assign(id, dto, file, user, langFrom(req));
  }

  /** Restitution : quantity unités d'un employé (userId ou assignmentId si plusieurs détenteurs) */
  @Post('assets/:id/return')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  returnAsset(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnAssetDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.returnAsset(id, dto, file, user, langFrom(req));
  }

  @Post('assets/:id/transfer')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  transfer(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferAssetDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.transfer(id, dto, file, user, langFrom(req));
  }

  @Post('assets/:id/repair')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  repair(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RepairAssetDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.repair(id, dto, file, user, langFrom(req));
  }

  @Post('assets/:id/condition')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  condition(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConditionAssetDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.changeCondition(id, dto, file, user, langFrom(req));
  }

  @Post('assets/:id/check')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  check(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckAssetDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.check(id, dto, file, user, langFrom(req));
  }

  /** Perte : quantity unités du stock, ou tout le bien */
  @Post('assets/:id/lost')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  lost(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LostAssetDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.markLost(id, dto ?? {}, file, user, langFrom(req));
  }

  @Post('assets/:id/found')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  found(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssetNoteDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.markFound(id, dto ?? {}, file, user, langFrom(req));
  }

  /** Sortie du patrimoine : quantity unités, ou tout le bien */
  @Post('assets/:id/dispose')
  @AuditAction(ActionType.UPDATE, 'asset')
  @UseInterceptors(FileInterceptor('image'))
  dispose(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DisposeAssetDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.dispose(id, dto, file, user, langFrom(req));
  }
}
