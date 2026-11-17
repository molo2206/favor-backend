import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrganizationVehicleRentalService } from './organization-vehicle-rental.service';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import {
  ConfirmOrganizationRentalPaymentDto,
  CreateOrganizationRentalDto,
  PayOrganizationRentalDto,
  UpdateOrganizationRentalStatusDto,
} from './dto/organization-rental.dto';

/**
 * ✅ Réservation DÉDIÉE de véhicules de location pour organisations.
 *    Paiement APRÈS prestation (F-Pay / Mobile Money / espèces).
 */
@Controller('organization-vehicle-rentals')
@UseGuards(AuthentificationGuard)
export class OrganizationVehicleRentalController {
  constructor(private readonly service: OrganizationVehicleRentalService) {}

  private ensureAdmin(user: UserEntity) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Réservé aux administrateurs.');
    }
  }

  /** Créer une réservation (organisation locataire / admin). Aucun paiement déclenché. */
  @Post()
  async create(@Body() dto: CreateOrganizationRentalDto, @CurrentUser() user: UserEntity) {
    return this.service.createReservation(dto, user.id);
  }

  @Get()
  async list(
    @CurrentUser() user: UserEntity,
    @Query('productId') productId?: string,
    @Query('clientId') clientId?: string,
    @Query('ownerId') ownerId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listReservations({
      productId: productId || undefined,
      clientId: clientId || undefined,
      ownerId: ownerId || undefined,
      status: status || undefined,
    });
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getReservation(id);
  }

  @Get(':id/payments')
  async payments(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPayments(id);
  }

  /** Mettre à jour le statut (admin) : CONFIRMED / IN_PROGRESS / COMPLETED / CANCELLED. */
  @Post(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationRentalStatusDto,
    @CurrentUser() user: UserEntity,
  ) {
    this.ensureAdmin(user);
    return this.service.updateStatus(id, dto);
  }

  /** Payer APRÈS la prestation (réservation COMPLETED). */
  @Post(':id/pay')
  async pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayOrganizationRentalDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.payAfterService(id, dto, user.id);
  }

  /** Confirmer un paiement FPAY / MOBILE_MONEY (callback du mécanisme de paiement). */
  @Post('payments/confirm')
  async confirm(
    @Body() dto: ConfirmOrganizationRentalPaymentDto,
    @CurrentUser() user: UserEntity,
  ) {
    this.ensureAdmin(user);
    return this.service.confirmPayment(dto);
  }
}
