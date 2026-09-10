// reservations.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Patch,
  ParseUUIDPipe,
  BadRequestException,
  Query,
  Req,
} from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { ReservationStatus } from './enum/reservation-status.enum';
import { ReservationsVehiclesService } from './reservations-vehicles.service';
import { PayReservationDto } from './dto/pay-reservation.dto';
import { CreateReservationAdminDto } from './dto/create-reservation-admin.dto';
import { PayReservationAdminDto } from './dto/pay-reservation-admin.dto';
import { I18nService } from 'src/libs/common/src';
import { Request } from 'express';

@Controller('reservations')
export class ReservationsController {
  constructor(
    private readonly reservationsService: ReservationsVehiclesService,
    private readonly i18n: I18nService,
  ) {}

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es','ar'];
    return supported.includes(primary) ? primary : 'fr';
  }

  @Post()
  @UseGuards(AuthentificationGuard)
  async create(
    @Body() createDto: CreateReservationDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const data = await this.reservationsService.create(createDto, user.id, lang);
    return { message: await this.i18n.translate('reservation.create_success', lang), data };
  }

  @Post(':id/pay')
  @UseGuards(AuthentificationGuard)
  async payReservation(
    @Param('id') id: string,
    @Body() payDto: PayReservationDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.reservationsService.payReservation(id, payDto, user.id, lang);
  }

  @Post('admin/create')
  @UseGuards(AuthentificationGuard)
  async createByAdmin(
    @Body() createDto: CreateReservationAdminDto,
    @CurrentUser() currentUser: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.reservationsService.createByAdmin(createDto, currentUser, lang);
  }

  @Post('admin/:id/pay')
  @UseGuards(AuthentificationGuard)
  async payReservationByAdmin(
    @Param('id') id: string,
    @Body() payDto: PayReservationAdminDto,
    @CurrentUser() currentUser: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.reservationsService.payReservationByAdmin(id, payDto, currentUser, lang);
  }

  @Get('my')
  @UseGuards(AuthentificationGuard)
  async myReservations(@CurrentUser() user: UserEntity, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    const data = await this.reservationsService.findAllByUser(user.id, lang);
    return { message: await this.i18n.translate('reservation.my_reservations', lang), data };
  }

  @Get('company')
  @UseGuards(AuthentificationGuard)
  async companyReservations(
    @CurrentUser() user: UserEntity,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(await this.i18n.translate('reservation.error.no_active_company', lang));
    }
    const paginatedResult = await this.reservationsService.findAllByCompany(
      user.activeCompanyId,
      +page,
      +limit,
      lang,
    );
    return { message: await this.i18n.translate('reservation.company_reservations', lang), data: paginatedResult };
  }

  @Get('trip/:tripId')
  @UseGuards(AuthentificationGuard)
  async findByTrip(
    @Param('tripId') tripId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.reservationsService.findAllByTrip(tripId, +page, +limit, lang);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    const data = await this.reservationsService.findOne(id, lang);
    return { message: await this.i18n.translate('reservation.found', lang), data };
  }

  @Patch(':id/status')
  @UseGuards(AuthentificationGuard)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: ReservationStatus,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const data = await this.reservationsService.updateStatus(id, status, undefined, lang);
    return { message: await this.i18n.translate('reservation.status_updated', lang), data };
  }

  @Post(':id/cancel')
  @UseGuards(AuthentificationGuard)
  async cancelReservationByUser(
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.reservationsService.cancelByUser(id, user.id, lang);
  }

  @Post('admin/:id/cancel')
  @UseGuards(AuthentificationGuard)
  async cancelReservationByAdmin(
    @Param('id') id: string,
    @CurrentUser() currentUser: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return this.reservationsService.cancelByAdmin(id, currentUser, lang);
  }

  @Get('trip/:tripId/available-seats')
  async getAvailableSeats(@Param('tripId', ParseUUIDPipe) tripId: string, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    const data = await this.reservationsService.getAvailableSeats(tripId, lang);
    return { message: await this.i18n.translate('reservation.available_seats', lang), data };
  }

  @Post('scan/:reservationId')
  @UseGuards(AuthentificationGuard)
  async scanTicket(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body('segmentId', ParseUUIDPipe) segmentId: string,
    @CurrentUser() currentUser: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    return await this.reservationsService.scanTicket(reservationId, segmentId, currentUser, lang);
  }
}