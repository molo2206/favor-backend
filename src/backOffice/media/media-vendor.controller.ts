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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditCategory, AuditSeverity } from 'src/audit/enum/audit.enums';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { MediaVendorService } from './services/media-vendor.service';
import { MediaVendorRateService } from './services/media-vendor-rate.service';
import {
  AddVendorPaymentDto,
  ChangeVendorStatusDto,
  CreateMediaVendorDto,
  CreateVendorAssignmentDto,
  CreateVendorDocumentDto,
  CreateVendorRateDto,
  MediaVendorQueryDto,
  ToggleVendorDto,
  UpdateMediaVendorDto,
  UpdateVendorRateDto,
  VendorRateStatusDto,
  VendorRatesExportQueryDto,
  VendorRatesQueryDto,
  UpdateVendorAssignmentDto,
  VendorAssignmentQueryDto,
  VendorAssignmentStatusDto,
  VendorAvailabilityQueryDto,
  VendorStatementQueryDto,
} from './dto/vendor.dto';

/**
 * BackOffice — Média : PRESTATAIRES EXTERNES (freelances, studios, agences…)
 * Préfixe : /backoffice/media
 */
@Controller('backoffice/media')
@UseGuards(AuthentificationGuard)
export class MediaVendorController {
  constructor(
    private readonly vendors: MediaVendorService,
    private readonly rates: MediaVendorRateService,
  ) { }

  // ============================================================
  // TABLEAU DE BORD / DETTES / DISPONIBILITÉS
  // ============================================================
  @Get('vendors/dashboard')
  dashboard(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.vendors.dashboard(companyId, user, langFrom(req));
  }

  /** Montants dus aux prestataires (par prestataire et par devise) */
  @Get('vendors/payables')
  payables(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.vendors.payables(companyId, user, langFrom(req));
  }

  /** Prestataires libres sur un créneau (?startAt&endAt&category&role) */
  @Get('vendors/availability')
  availability(@Req() req: Request, @Query() q: VendorAvailabilityQueryDto, @CurrentUser() user: UserEntity) {
    return this.vendors.availability(q, user, langFrom(req));
  }

  // ============================================================
  // ✅ DOMAINES ET CATALOGUE DES TARIFS (avant « vendors/:id »)
  // ============================================================
  /** Domaines d'intervention (photographe, vidéaste, infographe, graphiste, agence, imprimeur…) avec libellés traduits */
  @Get('vendors/domains')
  domains(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.rates.domains(companyId, user, langFrom(req));
  }

  /** Tous les tarifs (?domain&category&unit&currency&minPrice&maxPrice&vendorId&activeOnly&search&sortBy=price|name|vendor&sortOrder&page&limit) */
  @Get('vendors/rates')
  ratesCatalog(@Req() req: Request, @Query() q: VendorRatesQueryDto, @CurrentUser() user: UserEntity) {
    return this.rates.catalog(q, user, langFrom(req));
  }

  /** Grille des tarifs en Excel (défaut) ou PDF, mêmes filtres */
  @Get('vendors/rates/export')
  async ratesExport(@Req() req: Request, @Query() q: VendorRatesExportQueryDto, @CurrentUser() user: UserEntity, @Res() res: Response) {
    const file = await this.rates.export(q, user, langFrom(req));
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.buffer);
  }

  // ============================================================
  // RÉFÉRENTIEL
  // ============================================================
  /** JSON ou multipart/form-data (champ fichier « photo » ; rates en JSON) */
  @Post('vendors')
  @UseInterceptors(FileInterceptor('photo'))
  @AuditAction(ActionType.CREATE, 'media_vendor')
  create(@Req() req: Request, @Body() dto: CreateMediaVendorDto, @CurrentUser() user: UserEntity, @UploadedFile() photo?: Express.Multer.File) {
    return this.vendors.create(dto, user, langFrom(req), photo);
  }

  /** Liste filtrée et paginée (?status&type&category&role&city&minRating&withBalance&search&sortBy&sortOrder&page&limit) */
  @Get('vendors')
  list(@Req() req: Request, @Query() q: MediaVendorQueryDto, @CurrentUser() user: UserEntity) {
    return this.vendors.list(q, user, langFrom(req));
  }

  @Get('vendors/:id')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.vendors.findOne(id, user, langFrom(req));
  }

  /** JSON ou multipart/form-data (champ fichier « photo », removePhoto=true pour l'effacer) */
  @Patch('vendors/:id')
  @UseInterceptors(FileInterceptor('photo'))
  @AuditAction(ActionType.UPDATE, 'media_vendor')
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMediaVendorDto,
    @CurrentUser() user: UserEntity,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.vendors.update(id, dto, user, langFrom(req), photo);
  }

  /** ✅ Photo du prestataire (multipart, champ « photo ») */
  @Post('vendors/:id/photo')
  @UseInterceptors(FileInterceptor('photo'))
  @AuditAction(ActionType.UPDATE, 'media_vendor')
  setPhoto(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() photo: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.vendors.setPhoto(id, photo, user, langFrom(req));
  }

  @Delete('vendors/:id/photo')
  @AuditAction(ActionType.UPDATE, 'media_vendor')
  removePhoto(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.vendors.removePhoto(id, user, langFrom(req));
  }

  /** ACTIVE, PROSPECT, SUSPENDED, BLACKLISTED (motif obligatoire), ARCHIVED */
  @Patch('vendors/:id/status')
  @AuditAction(ActionType.UPDATE, 'media_vendor', { severity: AuditSeverity.WARNING })
  changeStatus(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeVendorStatusDto, @CurrentUser() user: UserEntity) {
    return this.vendors.changeStatus(id, dto, user, langFrom(req));
  }

  /** ✅ Activer / désactiver : { active: true|false, reason? } */
  @Patch('vendors/:id/toggle')
  @AuditAction(ActionType.UPDATE, 'media_vendor', { severity: AuditSeverity.WARNING })
  toggle(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ToggleVendorDto, @CurrentUser() user: UserEntity) {
    return this.vendors.toggle(id, dto, user, langFrom(req));
  }

  // ============================================================
  // ✅ PRESTATIONS ET TARIFS D'UN PRESTATAIRE
  // ============================================================
  @Get('vendors/:id/rates')
  vendorRates(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.rates.listForVendor(id, user, langFrom(req));
  }

  @Post('vendors/:id/rates')
  @AuditAction(ActionType.CREATE, 'media_vendor_rate', { category: AuditCategory.FINANCE })
  addRate(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateVendorRateDto, @CurrentUser() user: UserEntity) {
    return this.rates.create(id, dto, user, langFrom(req));
  }

  @Patch('vendors/:id/rates/:rateId')
  @AuditAction(ActionType.UPDATE, 'media_vendor_rate', { category: AuditCategory.FINANCE })
  updateRate(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rateId', ParseUUIDPipe) rateId: string,
    @Body() dto: UpdateVendorRateDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.rates.update(id, rateId, dto, user, langFrom(req));
  }

  /** { isActive: true|false } */
  @Patch('vendors/:id/rates/:rateId/status')
  @AuditAction(ActionType.UPDATE, 'media_vendor_rate', { category: AuditCategory.FINANCE })
  rateStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rateId', ParseUUIDPipe) rateId: string,
    @Body() dto: VendorRateStatusDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.rates.setStatus(id, rateId, dto, user, langFrom(req));
  }

  @Delete('vendors/:id/rates/:rateId')
  @AuditAction(ActionType.DELETE, 'media_vendor_rate', { category: AuditCategory.FINANCE })
  removeRate(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rateId', ParseUUIDPipe) rateId: string,
    @CurrentUser() user: UserEntity,
  ) {
    return this.rates.remove(id, rateId, user, langFrom(req));
  }

  /** Supprime (jamais engagé) ou archive (historique conservé) */
  @Delete('vendors/:id')
  @AuditAction(ActionType.DELETE, 'media_vendor')
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.vendors.remove(id, user, langFrom(req));
  }

  /** Relevé (?from&to&format=json|xlsx|pdf) */
  @Get('vendors/:id/statement')
  @AuditAction(ActionType.EXPORT, 'media_vendor', { category: AuditCategory.FINANCE, skipResponse: true })
  async statement(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: VendorStatementQueryDto,
    @CurrentUser() user: UserEntity,
  ) {
    const out: any = await this.vendors.statement(id, q, user, langFrom(req));
    if (out?.file) {
      res.setHeader('Content-Type', out.file.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${out.file.fileName}"`);
      res.send(out.file.buffer);
      return;
    }
    return out;
  }

  // ============================================================
  // DOSSIER
  // ============================================================
  /** multipart/form-data : file + type, title, expiresAt, note — ou url seule */
  @Post('vendors/:id/documents')
  @AuditAction(ActionType.CREATE, 'media_vendor_document')
  @UseInterceptors(FileInterceptor('file'))
  addDocument(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVendorDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
  ) {
    return this.vendors.addDocument(id, dto, file, user, langFrom(req));
  }

  @Delete('vendors/:id/documents/:documentId')
  @AuditAction(ActionType.DELETE, 'media_vendor_document')
  removeDocument(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: UserEntity,
  ) {
    return this.vendors.removeDocument(id, documentId, user, langFrom(req));
  }

  // ============================================================
  // MISSIONS
  // ============================================================
  /** Engager un prestataire sur un projet (et une séance) */
  @Post('projects/:id/vendors')
  @AuditAction(ActionType.CREATE, 'media_vendor_assignment')
  assign(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateVendorAssignmentDto, @CurrentUser() user: UserEntity) {
    return this.vendors.assign(id, dto, user, langFrom(req));
  }

  /** Prestataires du projet + coûts, reste à payer et marge */
  @Get('projects/:id/vendors')
  projectVendors(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.vendors.projectVendors(id, user, langFrom(req));
  }

  /** Toutes les missions (?vendorId&projectId&status&paymentStatus&late&from&to&search&page&limit) */
  @Get('vendor-assignments')
  listAssignments(@Req() req: Request, @Query() q: VendorAssignmentQueryDto, @CurrentUser() user: UserEntity) {
    return this.vendors.listAssignments(q, user, langFrom(req));
  }

  @Get('vendor-assignments/:id')
  findAssignment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.vendors.findAssignment(id, user, langFrom(req));
  }

  @Patch('vendor-assignments/:id')
  @AuditAction(ActionType.UPDATE, 'media_vendor_assignment')
  updateAssignment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorAssignmentDto, @CurrentUser() user: UserEntity) {
    return this.vendors.updateAssignment(id, dto, user, langFrom(req));
  }

  /** CONFIRMED, IN_PROGRESS, DELIVERED (deliveryUrl), VALIDATED (note 1-5), CANCELLED (motif) */
  @Patch('vendor-assignments/:id/status')
  @AuditAction(ActionType.UPDATE, 'media_vendor_assignment')
  assignmentStatus(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorAssignmentStatusDto, @CurrentUser() user: UserEntity) {
    return this.vendors.changeAssignmentStatus(id, dto, user, langFrom(req));
  }

  @Delete('vendor-assignments/:id')
  @AuditAction(ActionType.DELETE, 'media_vendor_assignment')
  removeAssignment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.vendors.removeAssignment(id, user, langFrom(req));
  }

  // ============================================================
  // PAIEMENTS
  // ============================================================
  @Post('vendor-assignments/:id/payments')
  @AuditAction(ActionType.PAYMENT, 'media_vendor_payment', { category: AuditCategory.FINANCE, severity: AuditSeverity.WARNING })
  addPayment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddVendorPaymentDto, @CurrentUser() user: UserEntity) {
    return this.vendors.addPayment(id, dto, user, langFrom(req));
  }

  @Delete('vendor-assignments/:id/payments/:paymentId')
  @AuditAction(ActionType.DELETE, 'media_vendor_payment', { category: AuditCategory.FINANCE, severity: AuditSeverity.CRITICAL })
  deletePayment(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: UserEntity,
  ) {
    return this.vendors.deletePayment(id, paymentId, user, langFrom(req));
  }
}
