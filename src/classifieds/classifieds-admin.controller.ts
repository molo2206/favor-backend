import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { ClassifiedPricingService } from './services/classified-pricing.service';
import { ClassifiedAdminService } from './services/classified-admin.service';
import { ClassifiedPaymentService } from './services/classified-payment.service';
import { langFrom } from './services/classified-common.service';
import {
  AdminClassifiedQueryDto,
  CreatePricingPlanDto,
  CreateTariffDto,
  HandleReportDto,
  ManualPaymentDto,
  PricingPlanQueryDto,
  RejectClassifiedDto,
  ReportsQueryDto,
  RevenueQueryDto,
  TariffZoneDto,
  UpdatePricingPlanDto,
  UpdateTariffDto,
} from './dto/classified.dto';

/**
 * Annonces — administration (ADMIN / SUPER ADMIN) : tarifs par ville, modération, signalements, recettes.
 * Préfixe : /admin/classifieds
 */
@Controller('admin/classifieds')
@UseGuards(AuthentificationGuard)
export class ClassifiedsAdminController {
  constructor(
    private readonly pricing: ClassifiedPricingService,
    private readonly admin: ClassifiedAdminService,
    private readonly payments: ClassifiedPaymentService,
  ) { }

  // ---------------- TARIFS ----------------
  @Post('pricing-plans')
  @AuditAction(ActionType.CREATE, 'classified_pricing')
  createPlan(@Req() req: Request, @Body() dto: CreatePricingPlanDto, @CurrentUser() user: UserEntity) {
    return this.pricing.createPlan(dto, user, langFrom(req));
  }

  @Get('pricing-plans')
  listPlans(@Req() req: Request, @Query() query: PricingPlanQueryDto, @CurrentUser() user: UserEntity) {
    return this.pricing.listPlans(query, user, langFrom(req));
  }

  @Patch('pricing-plans/:id')
  @AuditAction(ActionType.UPDATE, 'classified_pricing')
  updatePlan(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePricingPlanDto, @CurrentUser() user: UserEntity) {
    return this.pricing.updatePlan(id, dto, user, langFrom(req));
  }

  @Delete('pricing-plans/:id')
  @AuditAction(ActionType.DELETE, 'classified_pricing')
  deletePlan(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.pricing.deletePlan(id, user, langFrom(req));
  }

  /**
   * Copier les tarifs généraux vers une ville, avec un ajustement en % (ex. percent=20 → +20 %).
   * ✅ productType=CAR : seulement les tarifs de ce type de produit (ALL = seulement les tarifs « tous types »).
   */
  @Post('pricing-plans/copy-to-city/:cityId')
  @AuditAction(ActionType.CREATE, 'classified_pricing')
  copyToCity(
    @Req() req: Request,
    @Param('cityId', ParseUUIDPipe) cityId: string,
    @CurrentUser() user: UserEntity,
    @Query('percent') percent?: string,
    @Query('productType') productType?: string,
  ) {
    return this.pricing.copyToCity(cityId, Number(percent) || 0, user, langFrom(req), productType || undefined);
  }

  // ✅ TARIFS : nom + durée + devise, puis tableau Type | Prix
  @Get('tariffs')
  listTariffs(@Req() req: Request, @Query() query: TariffZoneDto, @CurrentUser() user: UserEntity) {
    return this.pricing.listTariffs(query, user, langFrom(req));
  }

  @Post('tariffs')
  @AuditAction(ActionType.CREATE, 'classified_pricing')
  createTariff(@Req() req: Request, @Body() dto: CreateTariffDto, @CurrentUser() user: UserEntity) {
    return this.pricing.createTariff(dto, user, langFrom(req));
  }

  @Patch('tariffs/:code')
  @AuditAction(ActionType.UPDATE, 'classified_pricing')
  updateTariff(@Req() req: Request, @Param('code') code: string, @Body() dto: UpdateTariffDto, @CurrentUser() user: UserEntity) {
    return this.pricing.updateTariff(code, dto, user, langFrom(req));
  }

  @Delete('tariffs/:code')
  @AuditAction(ActionType.DELETE, 'classified_pricing')
  deleteTariff(@Req() req: Request, @Param('code') code: string, @Query() query: TariffZoneDto, @CurrentUser() user: UserEntity) {
    return this.pricing.deleteTariff(code, query, user, langFrom(req));
  }

  /** Types de produit pour lesquels un tarif peut être fixé */
  @Get('pricing-plans/types')
  pricingTypes() {
    return this.pricing.productTypes();
  }

  /** Aperçu : tarifs appliqués à un type de produit dans une ville (et une catégorie) */
  @Get('pricing-preview')
  preview(
    @Req() req: Request,
    @Query('cityId', ParseUUIDPipe) cityId: string,
    @Query('categoryId') categoryId?: string,
    @Query('type') type?: string,
  ) {
    return this.pricing.publicPricing(cityId, categoryId || undefined, langFrom(req), type || undefined);
  }

  // ---------------- ANNONCES / MODÉRATION ----------------
  @Get('ads')
  list(@Req() req: Request, @Query() query: AdminClassifiedQueryDto, @CurrentUser() user: UserEntity) {
    return this.admin.list(query, user, langFrom(req));
  }

  @Patch('ads/:id/approve')
  @AuditAction(ActionType.UPDATE, 'classified')
  approve(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.admin.approve(id, user, langFrom(req));
  }

  @Patch('ads/:id/reject')
  @AuditAction(ActionType.UPDATE, 'classified')
  reject(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectClassifiedDto, @CurrentUser() user: UserEntity) {
    return this.admin.reject(id, dto, user, langFrom(req));
  }

  /** Paiement reçu hors application (espèces, agence) */
  @Post('ads/:id/manual-payment')
  @AuditAction(ActionType.CREATE, 'classified_payment')
  manualPayment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ManualPaymentDto, @CurrentUser() user: UserEntity) {
    return this.payments.manualPayment(id, dto, user, langFrom(req));
  }

  // ---------------- SIGNALEMENTS ----------------
  @Get('reports')
  reports(@Req() req: Request, @Query() query: ReportsQueryDto, @CurrentUser() user: UserEntity) {
    return this.admin.reports(query, user, langFrom(req));
  }

  @Patch('reports/:id')
  @AuditAction(ActionType.UPDATE, 'classified_report')
  handleReport(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HandleReportDto, @CurrentUser() user: UserEntity) {
    return this.admin.handleReport(id, dto, user, langFrom(req));
  }

  // ---------------- RECETTES ----------------
  @Get('revenue')
  revenue(@Req() req: Request, @Query() query: RevenueQueryDto, @CurrentUser() user: UserEntity) {
    return this.admin.revenue(query, user, langFrom(req));
  }
}
