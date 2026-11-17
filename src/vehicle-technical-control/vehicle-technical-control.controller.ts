import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { VehicleTechnicalControlService } from './vehicle-technical-control.service';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import {
  CompleteTechnicalControlDto,
  ConfigureTechnicalControlTariffDto,
  ConfirmTechnicalControlPaymentDto,
  CreateTechnicalControlDto,
  PayTechnicalControlDto,
  RenewTechnicalControlDto,
} from './dto/technical-control.dto';

/**
 * ✅ Contrôle technique des véhicules de location (CAR RENTAL/BOTH).
 *    Réservé aux administrateurs ; la configuration du tarif aux super-admins.
 */
@Controller('vehicle-technical-controls')
@UseGuards(AuthentificationGuard)
export class VehicleTechnicalControlController {
  constructor(private readonly service: VehicleTechnicalControlService) {}

  private ensureAdmin(user: UserEntity) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Réservé aux administrateurs / agents habilités.');
    }
  }

  private ensureSuperAdmin(user: UserEntity) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Réservé aux super-administrateurs.');
    }
  }

  // ---- Tarif (super-admin) ----
  @Get('tariff')
  async getTariff(@CurrentUser() user: UserEntity) {
    this.ensureAdmin(user);
    const data = await this.service.getActiveTariff();
    return { message: 'Tarif du contrôle technique', data };
  }

  @Post('tariff')
  async configureTariff(
    @Body() dto: ConfigureTechnicalControlTariffDto,
    @CurrentUser() user: UserEntity,
  ) {
    this.ensureSuperAdmin(user);
    return this.service.configureTariff(dto, user.id);
  }

  // ---- Création / renouvellement ----
  @Post()
  async create(@Body() dto: CreateTechnicalControlDto, @CurrentUser() user: UserEntity) {
    this.ensureAdmin(user);
    return this.service.createControl(dto, user.id);
  }

  @Post('renew')
  async renew(@Body() dto: RenewTechnicalControlDto, @CurrentUser() user: UserEntity) {
    this.ensureAdmin(user);
    return this.service.renewControl(dto, user.id);
  }

  // ---- Historique / validité par véhicule ----
  @Get('product/:productId')
  async vehicleControls(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: UserEntity,
  ) {
    this.ensureAdmin(user);
    return this.service.getVehicleControls(productId);
  }

  @Get('product/:productId/validity')
  async vehicleValidity(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: UserEntity,
  ) {
    this.ensureAdmin(user);
    return this.service.getVehicleControlValidity(productId);
  }

  // ---- Paiement ----
  @Post('payments/confirm')
  async confirmPayment(
    @Body() dto: ConfirmTechnicalControlPaymentDto,
    @CurrentUser() user: UserEntity,
  ) {
    this.ensureAdmin(user);
    return this.service.confirmPayment(dto);
  }

  // ---- Un contrôle précis ----
  @Get(':id')
  async getControl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    this.ensureAdmin(user);
    return this.service.getControl(id);
  }

  @Get(':id/amount')
  async amount(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    this.ensureAdmin(user);
    return this.service.getAmountToPay(id);
  }

  @Post(':id/pay')
  async pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayTechnicalControlDto,
    @CurrentUser() user: UserEntity,
  ) {
    this.ensureAdmin(user);
    return this.service.initiatePayment(id, dto, user.id);
  }

  @Post(':id/start')
  async start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    this.ensureAdmin(user);
    return this.service.startControl(id, user.id);
  }

  @Post(':id/complete')
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteTechnicalControlDto,
    @CurrentUser() user: UserEntity,
  ) {
    this.ensureAdmin(user);
    return this.service.completeControl(id, dto, user.id);
  }
}
