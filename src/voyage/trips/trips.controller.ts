// trips.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Patch,
  Delete,
  ParseUUIDPipe,
  BadRequestException,
  NotFoundException,
  DefaultValuePipe,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { ScheduleStatus } from '../vehicles/enum/schedule-status.enum';
import { I18nService } from 'src/libs/common/src';   // ✅ I18nService personnalisé
import { Request } from 'express';

@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly i18n: I18nService,
  ) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es', 'ar'];
    return supported.includes(primary) ? primary : 'fr';
  }

  // ==================== CREATE ====================

  @Post()
  @UseGuards(AuthentificationGuard)
  async create(
    @Body() createDto: CreateTripDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.no_active_company', lang),
      );
    }

    const hasSegments = createDto.segments && createDto.segments.length > 0;
    const hasSimpleFields = createDto.schedule_id && createDto.vehicle_id;

    if (!hasSegments && !hasSimpleFields) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.one_of_required', lang),
      );
    }

    if (hasSegments && hasSimpleFields) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.cannot_both', lang),
      );
    }

    const data = await this.tripsService.createTrip(createDto, user.activeCompanyId);
    const message = await this.i18n.translate('trips.create_success', lang);
    return { message, data };
  }

  // ==================== READ ====================

  @Get()
  @UseGuards(AuthentificationGuard)
  async findAll(
    @CurrentUser() user: UserEntity,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const result = await this.tripsService.findAll(user, page, limit);
    const message = await this.i18n.translate('trips.list_retrieved', lang);
    return { message, data: result.data };
  }

  @Get('all/with-segments')
  @UseGuards(AuthentificationGuard)
  async findAllWithSegments(@CurrentUser() user: UserEntity, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.no_active_company', lang),
      );
    }
    const data = await this.tripsService.findAllWithSegments(user.activeCompanyId);
    const message = await this.i18n.translate('trips.list_segments_retrieved', lang);
    return { message, data };
  }

  @Get('date')
  async findByDate(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.no_active_company', lang),
      );
    }
    if (!startDate && !endDate) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.date_range_required', lang),
      );
    }
    const data = await this.tripsService.findByDateRange(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null,
      user.activeCompanyId,
    );
    const message = await this.i18n.translate('trips.trips_found', lang);
    return { message, data };
  }

  @Get('search')
  async findByCities(
    @Req() req: Request,
    @Query('departure') departure: string,
    @Query('arrival') arrival: string,
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('passengers') passengers?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,

  ) {
    const lang = this.extractLanguage(req);
    if (!departure || !arrival) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.departure_arrival_required', lang),
      );
    }

    let dateObj: Date | undefined;
    let startObj: Date | undefined;
    let endObj: Date | undefined;

    if (date) {
      dateObj = new Date(date);
    } else if (startDate) {
      startObj = new Date(startDate);
      if (endDate) endObj = new Date(endDate);
    }

    const { trips, reversed } = await this.tripsService.findByCities(
      departure,
      arrival,
      dateObj,
      startObj,
      endObj,
      passengers,
    );

    const pageNum = page || 1;
    const limitNum = limit || 10;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedTrips = trips.slice(startIndex, startIndex + limitNum);

    let message = trips.length > 0
      ? await this.i18n.translate('trips.trips_found', lang)
      : await this.i18n.translate('trips.no_trips_found', lang);

    if (trips.length > 0 && reversed) {
      const reversedMsg = await this.i18n.translate('trips.reversed_route', lang);
      message = `⚠️ ${reversedMsg.replace('{from}', arrival.split(',')[0]).replace('{to}', departure.split(',')[0])}`;
    }

    return {
      message,
      data: {
        data: paginatedTrips,
        total: trips.length,
        page: pageNum,
        limit: limitNum,
      },
      filters: {
        departure: departure.split(',')[0].trim(),
        arrival: arrival.split(',')[0].trim(),
        date: date || null,
        startDate: startDate || null,
        endDate: endDate || null,
        passengers: passengers || null,
      },
    };
  }

  @Get('available-seats/:id')
  async getAvailableSeats(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    const data = await this.tripsService.getAvailableSeats(id);
    const message = await this.i18n.translate('trips.available_seats', lang);
    return { message, data };
  }

  @Get('segments/:segmentId')
  async getSegmentById(@Param('segmentId', ParseUUIDPipe) segmentId: string, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    const data = await this.tripsService.findSegmentById(segmentId);
    if (!data) {
      throw new NotFoundException(
        await this.i18n.translate('trips.validation.segment_not_found', lang, { id: segmentId }),
      );
    }
    const message = await this.i18n.translate('trips.segment_found', lang);
    return { message, data };
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    const data = await this.tripsService.findOne(id);
    const message = await this.i18n.translate('trips.trip_found', lang);
    return { message, data };
  }

  @Get(':id/with-segments')
  async findOneWithSegments(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    const data = await this.tripsService.findOneWithSegments(id);
    const message = await this.i18n.translate('trips.trip_segments_retrieved', lang);
    return { message, data };
  }

  @Get(':id/segments')
  async findSegmentsByTrip(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    const data = await this.tripsService.findSegmentsByTrip(id);
    const message = await this.i18n.translate('trips.segments_list', lang);
    return { message, data };
  }

  // ==================== UPDATE ====================

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateTripDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.no_active_company', lang),
      );
    }
    const data = await this.tripsService.update(id, updateDto, user.activeCompanyId);
    const message = await this.i18n.translate('trips.update_success', lang);
    return { message, data };
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: ScheduleStatus,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const data = await this.tripsService.updateStatus(id, status);
    const message = await this.i18n.translate('trips.status_updated', lang);
    return { message, data };
  }

  @Patch('segments/:segmentId/status')
  async updateSegmentStatus(
    @Param('segmentId', ParseUUIDPipe) segmentId: string,
    @Body('status') status: ScheduleStatus,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.no_active_company', lang),
      );
    }
    const data = await this.tripsService.updateSegmentStatus(segmentId, status);
    const message = await this.i18n.translate('trips.segment_status_updated', lang);
    return { message, data };
  }

  // ==================== DELETE ====================

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.no_active_company', lang),
      );
    }
    await this.tripsService.remove(id, user.activeCompanyId);
    const message = await this.i18n.translate('trips.delete_success', lang);
    return { message };
  }

  // ==================== STATISTICS ====================

  @Get('stats/dashboard')
  async getTripStats(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,

  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('trips.validation.no_active_company', lang),
      );
    }
    const data = await this.tripsService.getTripStats(
      user.activeCompanyId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
    const message = await this.i18n.translate('trips.stats_retrieved', lang);
    return { message, data };
  }
}