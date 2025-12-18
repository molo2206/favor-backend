import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Patch,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { RoomAvailabilityService } from './room-availability.service';
import { UpdateRoomAvailabilityDto } from './dto/update-room-availability.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability-dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { SearchRoomsDto } from './dto/search-room-dtod';
import { Product } from 'src/products/entities/product.entity';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { Reservation } from './entity/Reservation.entity';
import { ReservationStatus } from './enum/reservation-room.enum';

@Controller('booking')
export class RoomAvailabilityController {
  constructor(private readonly service: RoomAvailabilityService) {}

  @Post('availability')
  create(@Body() dto: CreateRoomAvailabilityDto) {
    return this.service.create(dto);
  }

  @Patch('availability/:id')
  update(@Param('id') id: string, @Body() dto: UpdateRoomAvailabilityDto) {
    return this.service.update(id, dto);
  }

  @Get('availability/:productId')
  findRange(
    @Param('productId') productId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.findForProductBetween(productId, from, to);
  }

  @Post('availability/generate')
  generateCalendar(@Body() body: { productId: string; from: string; to: string }) {
    return this.service.generateCalendar(body.productId, body.from, body.to);
  }

  @UseGuards(AuthentificationGuard)
  @Post('room')
  reserve(@CurrentUser() user: UserEntity, @Body() body: CreateReservationDto) {
    return this.service.reserveRoom(user.id, body);
  }

  @UseGuards(AuthentificationGuard)
  @Get('user/reservations')
  async getUserReservations(
    @CurrentUser() user: UserEntity,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return await this.service.getUserReservations(user.id, { page, limit });
  }

  @UseGuards(AuthentificationGuard)
  @Get('by-company')
  async getCompanyReservations(
    @CurrentUser() user: UserEntity,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: ReservationStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    return await this.service.getCompanyReservations(user.activeCompanyId, {
      startDate,
      endDate,
      status,
      page,
      limit,
    });
  }

  @UseGuards(AuthentificationGuard)
  @Get('all-reservations')
  async getAllReservations() {
    return await this.service.getAllReservations();
  }

  @Get('most-reserved')
  async getMostReservedRooms(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.service.getMostVisitedHotels(page, limit);
  }

  @Patch('action/:id/reject')
  async rejectReservation(@Param('id') id: string, @Body() body: { reason: string }) {
    const { reason } = body;
    return await this.service.rejectReservation(id, reason);
  }

  @UseGuards(AuthentificationGuard)
  @Patch('action/:id/cancel')
  async cancelReservation(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: UserEntity,
  ) {
    const { reason } = body;

    if (!reason?.trim()) {
      throw new BadRequestException('La raison de l’annulation est obligatoire.');
    }

    return await this.service.cancelReservation(id, user.id, reason);
  }

  @Patch('action/:id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReservationStatusDto,
  ): Promise<{ message: string; data: Reservation }> {
    if (!dto.status) {
      throw new BadRequestException('Le statut est obligatoire.');
    }

    const reservation = await this.service.updateReservationStatus(id, dto);

    if (!reservation) {
      throw new NotFoundException('Réservation introuvable.');
    }

    return reservation;
  }

  @Get('one/:id')
  async getReservation(@Param('id') id: string) {
    return await this.service.getReservationById(id);
  }

  @Get('search')
  async searchProducts(
    @Query('destination') destination: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('rooms') rooms?: string,
    @Query('adults') adults?: string,
    @Query('children') children?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const roomsNumber = rooms ? parseInt(rooms, 10) : undefined;
    const adultsNumber = adults ? parseInt(adults, 10) : 1;
    const childrenNumber = children ? parseInt(children, 10) : 0;
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;

    const result = await this.service.searchProductsByDestination({
      destination,
      startDate,
      endDate,
      rooms: roomsNumber,
      adults: adultsNumber,
      children: childrenNumber,
      page: pageNumber,
      limit: limitNumber,
    });

    return result;
  }

  @Get('rooms/:companyId/available')
  async getAvailableRooms(
    @Param('companyId') companyId: string,
  ): Promise<{ message: string; data: any[] }> {
    return this.service.getAvailableRoomsByCompany(companyId);
  }
}
