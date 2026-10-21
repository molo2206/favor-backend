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
  Req,
} from '@nestjs/common';
import { RoomAvailabilityService } from './room-availability.service';
import { UpdateRoomAvailabilityDto } from './dto/update-room-availability.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability-dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { Reservation } from './entity/Reservation.entity';
import { ReservationStatus } from './enum/reservation-room.enum';
import { I18nService } from 'src/libs/common/src';
import { Request } from 'express';

@Controller('booking')
export class RoomAvailabilityController {
  constructor(
    private readonly service: RoomAvailabilityService,
    private readonly i18n: I18nService,
  ) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es'];
    return supported.includes(primary) ? primary : 'fr';
  }

  @Post('availability')
  async create(@Body() dto: CreateRoomAvailabilityDto, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    return this.service.create(dto, lang);
  }

  @Patch('availability/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomAvailabilityDto,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.service.update(id, dto, lang);
  }

  @Get('availability/:productId')
  async findRange(
    @Param('productId') productId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.service.findForProductBetween(productId, from, to, lang);
  }

  @Post('availability/generate')
  async generateCalendar(
    @Body() body: { productId: string; from: string; to: string },
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.service.generateCalendar(body.productId, body.from, body.to, lang);
  }

  @UseGuards(AuthentificationGuard)
  @Post('room')
  async reserve(
    @CurrentUser() user: UserEntity,
    @Body() body: CreateReservationDto,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.service.reserveRoom(user.id, body, lang);
  }

  @UseGuards(AuthentificationGuard)
  @Get('user/reservations')
  async getUserReservations(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const lang = this.extractLanguage(req);
    return await this.service.getUserReservations(user.id, { page, limit }, lang);
  }

  @UseGuards(AuthentificationGuard)
  @Get('by-company')
  async getCompanyReservations(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: ReservationStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,

  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('reservation.error.no_active_company', lang),
      );
    }
    return await this.service.getCompanyReservations(
      user.activeCompanyId,
      { startDate, endDate, status, page, limit },
      lang,
    );
  }

  @UseGuards(AuthentificationGuard)
  @Get('all-reservations')
  async getAllReservations(@Req() req: Request) {
    const lang = this.extractLanguage(req);
    return await this.service.getAllReservations(lang);
  }

  @Get('most-reserved')
  async getMostReservedRooms(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.service.getMostVisitedHotels(page, limit, lang);
  }

  @Patch('action/:id/reject')
  async rejectReservation(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const { reason } = body;
    return await this.service.rejectReservation(id, reason, lang);
  }

  @UseGuards(AuthentificationGuard)
  @Patch('action/:id/cancel')
  async cancelReservation(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const { reason } = body;
    if (!reason?.trim()) {
      throw new BadRequestException(
        await this.i18n.translate('reservation.error.cancel_reason_required', lang),
      );
    }
    return await this.service.cancelReservation(id, user.id, reason, lang);
  }

  @Patch('action/:id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReservationStatusDto,
    @Req() req: Request,
  ): Promise<{ message: string; data: Reservation }> {
    const lang = this.extractLanguage(req);
    if (!dto.status) {
      throw new BadRequestException(
        await this.i18n.translate('reservation.error.status_required', lang),
      );
    }
    const reservation = await this.service.updateReservationStatus(id, dto, lang);
    if (!reservation) {
      throw new NotFoundException(
        await this.i18n.translate('reservation.error.not_found', lang, { id }),
      );
    }
    return reservation;
  }

  @Get('one/:id')
  async getReservation(@Param('id') id: string, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    return await this.service.getReservationById(id, lang);
  }

  @Get('search')
  async searchProducts(
    @Req() req: Request,
    @Query('destination') destination: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('rooms') rooms?: string,
    @Query('adults') adults?: string,
    @Query('children') children?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const lang = this.extractLanguage(req);
    const roomsNumber = rooms ? parseInt(rooms, 10) : undefined;
    const adultsNumber = adults ? parseInt(adults, 10) : 1;
    const childrenNumber = children ? parseInt(children, 10) : 0;
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;

    const result = await this.service.searchProductsByDestination(
      {
        destination,
        startDate,
        endDate,
        rooms: roomsNumber,
        adults: adultsNumber,
        children: childrenNumber,
        page: pageNumber,
        limit: limitNumber,
      },
      lang,
    );
    return result;
  }

  @Get('rooms/:companyId/available')
  async getAvailableRooms(
    @Param('companyId') companyId: string,
    @Req() req: Request,
  ): Promise<{ message: string; data: any[] }> {
    const lang = this.extractLanguage(req);
    return this.service.getAvailableRoomsByCompany(companyId, lang);
  }
}