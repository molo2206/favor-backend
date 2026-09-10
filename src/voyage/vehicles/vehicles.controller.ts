import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
  BadRequestException,
  UseInterceptors,
  UploadedFiles,
  ValidationPipe,
  UsePipes,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { ResponseDto } from './dto/response.dto';
import { CreateVehicleScheduleDto } from './dto/create-vehicle-schedule.dto';
import { UpdateVehicleScheduleDto } from './dto/update-vehicle-schedule.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { VehicleStatus } from './enum/vehicle-status.enum';
import { VehicleType } from './enum/vehicle-type.enum';
import { ScheduleStatus } from './enum/schedule-status.enum';
import { Public } from 'src/users/utility/decorators/public.decorator';
import { UpdateVehicleStatusDto } from './dto/update-vehicle-status.dto';
import { I18nService } from 'src/libs/common/src'; // Utiliser notre propre I18nService
import { Request } from 'express';

@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly i18n: I18nService,
  ) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es', 'ar'];
    return supported.includes(primary) ? primary : 'fr';
  }

  // ==================== VEHICLES ENDPOINTS ====================

  @Post()
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.CREATED)
  @AuditAction(ActionType.CREATE, 'vehicles')
  @UseInterceptors(FilesInterceptor('images', 10))
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() createVehicleDto: CreateVehicleDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ): Promise<ResponseDto<any>> {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('vehicles.validation.no_active_company', lang),
      );
    }
    return this.vehiclesService.create(createVehicleDto, user, files);
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  async findAll(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: VehicleStatus,
    @Query('vehicleType') vehicleType?: VehicleType,
  ): Promise<ResponseDto<any>> {
    // Pas de traduction ici, le service renvoie déjà le message dans la langue par défaut
    const result = await this.vehiclesService.findAll(user, page, limit, status, vehicleType);
    return result;
  }

  @Get(':id')
  async findOne(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResponseDto<any>> {
    return this.vehiclesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'vehicles')
  @UseInterceptors(FilesInterceptor('images', 10))
  async update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() updateVehicleDto: UpdateVehicleDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ResponseDto<any>> {
    return this.vehiclesService.update(id, updateVehicleDto, user, files);
  }

  @Patch(':id/status')
  @UseGuards(AuthentificationGuard)
  async updateStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStatusDto: UpdateVehicleStatusDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.vehiclesService.updateStatus(id, updateStatusDto, user);
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.DELETE, 'vehicles')
  async remove(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ResponseDto<null>> {
    return this.vehiclesService.remove(id, user);
  }

  // ==================== SCHEDULES ENDPOINTS ====================

  @Post('schedules')
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.CREATED)
  @AuditAction(ActionType.CREATE, 'vehicle-schedules')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createSchedule(
    @Body() createScheduleDto: CreateVehicleScheduleDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ): Promise<ResponseDto<any>> {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('vehicles.validation.no_active_company', lang),
      );
    }
    return this.vehiclesService.createSchedule(createScheduleDto, user);
  }

  @Get('schedules/all')
  @Public()
  async findAllSchedules(
    @Req() req: Request,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: ScheduleStatus,
    @Query('companyId') companyId?: string,
  ): Promise<ResponseDto<any>> {
    return this.vehiclesService.findAllSchedules(companyId, page, limit, status);
  }

  @Get('schedules/:id')
  async findOneSchedule(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResponseDto<any>> {
    return this.vehiclesService.findOneSchedule(id);
  }

  @Patch('schedules/:id')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'vehicle-schedules')
  async updateSchedule(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateScheduleDto: UpdateVehicleScheduleDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ResponseDto<any>> {
    return this.vehiclesService.updateSchedule(id, updateScheduleDto, user);
  }

  @Delete('schedules/:id')
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.DELETE, 'vehicle-schedules')
  async removeSchedule(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ResponseDto<null>> {
    return this.vehiclesService.removeSchedule(id, user);
  }

  // ==================== SPECIALIZED ENDPOINTS ====================

  @Get('available/search')
  async getAvailableVehicles(
    @Query('departureCity') departureCity: string,
    @Query('arrivalCity') arrivalCity: string,
    @Query('date') date: string,
    @Req() req: Request,
  ): Promise<ResponseDto<any>> {
    const lang = this.extractLanguage(req);
    if (!departureCity || !arrivalCity || !date) {
      throw new BadRequestException(
        await this.i18n.translate('vehicles.validation.required_fields', lang),
      );
    }
    return this.vehiclesService.getAvailableVehicles(departureCity, arrivalCity, new Date(date));
  }

  @Patch(':id/images')
  @AuditAction(ActionType.UPDATE, 'vehicles')
  async updateImages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('images') images: string[],
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ): Promise<ResponseDto<any>> {
    const lang = this.extractLanguage(req);
    if (!images || !Array.isArray(images)) {
      throw new BadRequestException(
        await this.i18n.translate('vehicles.validation.images_array', lang),
      );
    }
    return this.vehiclesService.updateVehicleImages(id, images, user);
  }
}