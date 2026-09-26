import {
  Controller,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  ParseUUIDPipe,
  Get,
  Delete,
  UsePipes,
  ValidationPipe,
  Query,
} from '@nestjs/common';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { TravelReservationService } from './travel_reservation.service';
import { CreateTravelReservationDto } from './dto/create-travel_reservation.dto';
import { UpdateReservationStatusDto } from './dto/update-travel_reservation.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { ReservationStatus } from './enum/reservation.status.enum';
import { TravelReservationEntity } from './entities/travel_reservation.entity';

@Controller('travel')
@UseGuards(AuthentificationGuard)
export class TravelReservationController {
  constructor(private readonly reservationService: TravelReservationService) {}

  // Créer une réservation
  @Post()
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createReservation(
    @CurrentUser() currentUser: UserEntity,
    @Body() dto: CreateTravelReservationDto,
  ): Promise<{ data: TravelReservationEntity }> {
    const reservation = await this.reservationService.createReservation(currentUser.id, dto);
    return { data: reservation };
  }

  // Mettre à jour le statut
  @Patch(':id/status')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReservationStatusDto,
  ): Promise<{ data: TravelReservationEntity }> {
    const updated = await this.reservationService.updateStatus(id, dto.status);
    return { data: updated };
  }

  // Récupérer les réservations du client connecté
  @Get('my-travel/me')
  @AuthorizeRoles(['CUSTOMER','ADMIN', 'SUPER ADMIN'])
  async getMyReservations(
    @CurrentUser() currentUser: UserEntity,
  ): Promise<{ data: TravelReservationEntity[] }> {
    const reservations = await this.reservationService.getReservationsForClient(currentUser.id);
    return { data: reservations };
  }

  // Récupérer toutes les réservations (optionnellement filtrées par statut)
  @Get()
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async findAll(@Query('status') status?: ReservationStatus) {
    return await this.reservationService.findAll(status);
  }

  // Récupérer une réservation par ID
  @Get(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const reservation = await this.reservationService.findOneById(id);
    return { data: reservation };
  }

  // Supprimer une réservation
  @Delete(':id')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return await this.reservationService.removeReservation(id);
  }
}
