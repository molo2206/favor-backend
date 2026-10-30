import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Patch,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { RideService } from './ride.service';
import { RidePaymentService } from './ride-payment.service';
import { CreateRideDto } from './dto/create-ride.dto';
import { UpdateRideDto } from './dto/update-ride.dto';
import {
  CancelRideDto,
  CompleteRideDto,
  RateRideDto,
  RejectRideDto,
  RideEstimateDto,
  RideHistoryQueryDto,
  PayRideDto,
  ChangeRidePaymentMethodDto,
  ConfirmRidePaymentDto,
} from './dto/ride-actions.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { Roles } from 'src/users/utility/decorators/roles.decorator';
import { UserRole } from 'src/users/enum/user-role-enum';

const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

@Controller('rides')
export class RideController {
  constructor(
    private readonly rideService: RideService,
    private readonly ridePayments: RidePaymentService,
  ) {}

  private lang(req: Request): string {
    const raw = String(req?.headers?.['accept-language'] || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2);
    return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
  }

  // ============================================================
  // ✅ AJOUT : estimation, course en cours, historique
  // ============================================================

  /** Prix par catégorie + chauffeur le plus proche, avant de commander */
  @Post('estimate')
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.OK)
  estimate(@Req() req: Request, @Body() dto: RideEstimateDto) {
    return this.rideService.estimate(dto, this.lang(req));
  }

  /** Course en cours (passager ou chauffeur) — à appeler à l'ouverture de l'app */
  @Get('active')
  @UseGuards(AuthentificationGuard)
  active(@Req() req: Request, @CurrentUser() user: UserEntity) {
    return this.rideService.active(user, this.lang(req));
  }

  /** Mes courses : ?as=rider (défaut) | driver, &status=, &page=, &limit= */
  @Get('me')
  @UseGuards(AuthentificationGuard)
  myRides(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() query: RideHistoryQueryDto) {
    return this.rideService.myRides(user, query, this.lang(req));
  }

  // ============================================================
  // ROUTES EXISTANTES (conservées)
  // ============================================================

  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.CREATE, 'rides')
  create(@Req() req: Request, @Body() dto: CreateRideDto, @CurrentUser() user: UserEntity) {
    return this.rideService.create(dto, user, this.lang(req));
  }

  @Get()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.VIEW, 'rides')
  findAll(@Req() req: Request) {
    return this.rideService.findAll(this.lang(req));
  }

  @Get(':id')
  @UseGuards(AuthentificationGuard)
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.rideService.findOne(id, this.lang(req), user);
  }

  /** ✅ AJOUT : historique complet de la course */
  @Get(':id/events')
  @UseGuards(AuthentificationGuard)
  events(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.rideService.events(id, user, this.lang(req));
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRideDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.rideService.update(id, dto, this.lang(req), user);
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.DELETE, 'rides')
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.rideService.remove(id, this.lang(req));
  }

  @Post(':id/accept')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  async acceptRide(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ) {
    // Réponse inchangée : la course mise à jour
    return this.rideService.updateDriver(id, user.id, this.lang(req));
  }

  /** ✅ AJOUT : le chauffeur refuse l'offre */
  @Post(':id/reject')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  @HttpCode(HttpStatus.OK)
  reject(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
    @Body() dto: RejectRideDto,
  ) {
    return this.rideService.rejectOffer(id, user.id, dto?.reason, this.lang(req));
  }

  /** ✅ AJOUT : le chauffeur est arrivé au point de prise en charge */
  @Post(':id/arrived')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  @HttpCode(HttpStatus.OK)
  arrived(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.rideService.markArrived(id, user, this.lang(req));
  }

  /** ✅ AJOUT : début du trajet (passager à bord) */
  @Post(':id/start')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  @HttpCode(HttpStatus.OK)
  start(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.rideService.startRide(id, user, this.lang(req));
  }

  /** ✅ AJOUT : fin de course (prix final, commission, gain chauffeur) */
  @Post(':id/complete')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  @HttpCode(HttpStatus.OK)
  complete(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
    @Body() dto: CompleteRideDto,
  ) {
    return this.rideService.completeRide(id, user, dto ?? {}, this.lang(req));
  }

  // ============================================================
  // ✅ AJOUT : PAIEMENT DE LA COURSE
  // ============================================================

  /** État du paiement : prix, frais de transaction, total, statut (vérifie le Mobile Money en attente) */
  @Get(':id/payment')
  @UseGuards(AuthentificationGuard)
  payment(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.ridePayments.getPayment(id, user, this.lang(req));
  }

  /** Passager : changer de mode de paiement (frais recalculés) */
  @Patch(':id/payment-method')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  changePaymentMethod(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRidePaymentMethodDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.ridePayments.changeMethod(id, dto, user, this.lang(req));
  }

  /** Passager : payer (MOBILE_MONEY : provider + phone ; FPAY : access_token ; CASH/CARD : à remettre au chauffeur) */
  @Post(':id/pay')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  @HttpCode(HttpStatus.OK)
  pay(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayRideDto, @CurrentUser() user: UserEntity) {
    return this.ridePayments.pay(id, dto ?? {}, user, this.lang(req));
  }

  /** Chauffeur : espèces ou carte reçues */
  @Post(':id/payment/confirm')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  @HttpCode(HttpStatus.OK)
  confirmPayment(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmRidePaymentDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.ridePayments.confirmByDriver(id, dto ?? {}, user, this.lang(req));
  }

  /** Admin : virement / agence / régularisation */
  @Post(':id/payment/admin-confirm')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.UPDATE, 'rides')
  @HttpCode(HttpStatus.OK)
  adminConfirmPayment(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmRidePaymentDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.ridePayments.confirmByAdmin(id, dto ?? {}, user, this.lang(req));
  }

  /** ✅ AJOUT : noter le chauffeur (passager) ou le passager (chauffeur) */
  @Post(':id/rate')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  @HttpCode(HttpStatus.OK)
  rate(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
    @Body() dto: RateRideDto,
  ) {
    return this.rideService.rateRide(id, user, dto, this.lang(req));
  }

  @Post(':id/cancel')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  @HttpCode(HttpStatus.OK)
  async cancelRide(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
    @Body() body: CancelRideDto,
  ) {
    const lang = this.lang(req);
    // ✅ Qui annule : déterminé par le lien avec la course (puis par le rôle, comme avant)
    const current = await this.rideService.findOne(id, lang, user);
    let cancelledBy: 'RIDER' | 'DRIVER' | 'SYSTEM' = 'SYSTEM';
    if (current.data.riderId === user.id) cancelledBy = 'RIDER';
    else if (current.data.driverId === user.id) cancelledBy = 'DRIVER';
    else if (user.role === UserRole.CUSTOMER) cancelledBy = 'RIDER';
    else if (user.role === UserRole.DRIVER) cancelledBy = 'DRIVER';

    // Réponse inchangée : la course mise à jour
    return this.rideService.cancelRide(id, cancelledBy, body?.cancellationReason, lang, user);
  }
}
